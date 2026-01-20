import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MongoClient } from "https://deno.land/x/mongo@v0.32.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Derive encryption key from password using PBKDF2
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

// Generate HMAC for integrity verification
async function generateHmac(data: Uint8Array, password: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + arrayToBase64(salt)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", keyMaterial, data as BufferSource);
  return arrayToBase64(new Uint8Array(signature));
}

// Encrypt file using AES-GCM
async function encryptFile(data: Uint8Array, key: CryptoKey, iv: Uint8Array): Promise<Uint8Array> {
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource
  );
  return new Uint8Array(encrypted);
}

function arrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const password = formData.get("password") as string;
    const code = formData.get("code") as string;

    if (!file || !password || !code) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: file, password, or code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate code format
    if (!/^#[A-Z0-9]{6}$/.test(code)) {
      return new Response(
        JSON.stringify({ error: "Invalid code format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Read file data
    const fileData = new Uint8Array(await file.arrayBuffer());

    // Derive encryption key
    const key = await deriveKey(password, salt);

    // Encrypt file
    const encryptedData = await encryptFile(fileData, key, iv);

    // Combine IV + encrypted data for storage
    const combinedData = new Uint8Array(iv.length + encryptedData.length);
    combinedData.set(iv, 0);
    combinedData.set(encryptedData, iv.length);

    // Generate HMAC for integrity
    const hmac = await generateHmac(combinedData, password, salt);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique storage path
    const storagePath = `${code.substring(1)}/${crypto.randomUUID()}`;

    // Upload encrypted file to storage
    const { error: uploadError } = await supabase.storage
      .from("encrypted-files")
      .upload(storagePath, combinedData, {
        contentType: "application/octet-stream",
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect to MongoDB
    const mongoUri = Deno.env.get("MONGODB_URI")!;
    const client = new MongoClient();
    await client.connect(mongoUri);
    const db = client.database("secure-file-sharing");
    const filesCollection = db.collection("files");

    // Check if code already exists
    const existing = await filesCollection.findOne({ code });
    if (existing) {
      // Clean up uploaded file
      await supabase.storage.from("encrypted-files").remove([storagePath]);
      await client.close();
      return new Response(
        JSON.stringify({ error: "Code already in use. Please generate a new code." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save metadata to MongoDB
    await filesCollection.insertOne({
      code,
      storagePath,
      originalFileName: file.name,
      hmac,
      salt: arrayToBase64(salt),
      createdAt: new Date(),
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true, code }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
