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
    ["decrypt"]
  );
}

// Verify HMAC for integrity
async function verifyHmac(data: Uint8Array, password: string, salt: Uint8Array, expectedHmac: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + arrayToBase64(salt)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", keyMaterial, data as BufferSource);
  const computedHmac = arrayToBase64(new Uint8Array(signature));
  
  return computedHmac === expectedHmac;
}

// Decrypt file using AES-GCM
async function decryptFile(data: Uint8Array, key: CryptoKey, iv: Uint8Array): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    data as BufferSource
  );
  return new Uint8Array(decrypted);
}

function arrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}

function base64ToArray(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, password } = await req.json();

    if (!code || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: code or password" }),
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

    // Connect to MongoDB
    const mongoUri = Deno.env.get("MONGODB_URI")!;
    const client = new MongoClient();
    await client.connect(mongoUri);
    const db = client.database("secure-file-sharing");
    const filesCollection = db.collection("files");

    // Find file metadata
    const fileMetadata = await filesCollection.findOne({ code });
    if (!fileMetadata) {
      await client.close();
      return new Response(
        JSON.stringify({ error: "File not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await client.close();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download encrypted file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("encrypted-files")
      .download(fileMetadata.storagePath as string);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to retrieve file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert blob to Uint8Array
    const combinedData = new Uint8Array(await fileData.arrayBuffer());

    // Convert salt from base64
    const salt = base64ToArray(fileMetadata.salt as string);

    // Verify HMAC BEFORE decryption (integrity check)
    const isValid = await verifyHmac(combinedData, password, salt, fileMetadata.hmac as string);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Integrity check failed. Wrong password or file corrupted." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract IV (first 12 bytes) and encrypted data
    const iv = combinedData.slice(0, 12);
    const encryptedData = combinedData.slice(12);

    // Derive decryption key
    const key = await deriveKey(password, salt);

    // Decrypt file
    let decryptedData: Uint8Array;
    try {
      decryptedData = await decryptFile(encryptedData, key, iv);
    } catch (decryptError) {
      console.error("Decryption error:", decryptError);
      return new Response(
        JSON.stringify({ error: "Decryption failed. Wrong password." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const originalFileName = fileMetadata.originalFileName as string;

    // Return decrypted file with original filename
    return new Response(decryptedData as unknown as BodyInit, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${originalFileName}"`,
        "X-Original-Filename": encodeURIComponent(originalFileName),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
