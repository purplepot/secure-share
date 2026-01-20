import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, accept-language, origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Derive encryption key from password using PBKDF2
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

// Generate HMAC for integrity verification
async function generateHmac(data, password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + arrayToBase64(salt)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", keyMaterial, data);
  return arrayToBase64(new Uint8Array(signature));
}

// Encrypt file using AES-GCM
async function encryptFile(data, key, iv) {
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new Uint8Array(encrypted);
}

function arrayToBase64(arr) {
  return btoa(String.fromCharCode(...arr));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    // Preflight request
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const password = formData.get("password");
    const code = formData.get("code");

    if (!file || !password || !code) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: file, password, or code",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate code format
    if (!/^#[A-Z0-9]{6}$/.test(code)) {
      return new Response(JSON.stringify({ error: "Invalid code format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Paths inside the bucket (no Mongo; metadata stored alongside the file)
    const codeKey = code.substring(1);
    const storagePath = `files/${codeKey}/${crypto.randomUUID()}`;
    const metadataPath = `codes/${codeKey}.json`;

    // Prevent code reuse by checking existing metadata
    const { data: existingMeta, error: metaCheckError } = await supabase.storage
      .from("encrypted-files")
      .download(metadataPath);

    if (!metaCheckError && existingMeta) {
      return new Response(
        JSON.stringify({
          error: "Code already in use. Please generate a new code.",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Upload encrypted file to storage
    const { error: uploadError } = await supabase.storage
      .from("encrypted-files")
      .upload(storagePath, combinedData, {
        contentType: "application/octet-stream",
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Write metadata JSON to storage
    const metadata = {
      code,
      storagePath,
      originalFileName: file.name,
      hmac,
      salt: arrayToBase64(salt),
      createdAt: new Date().toISOString(),
    };

    const { error: metaUploadError } = await supabase.storage
      .from("encrypted-files")
      .upload(
        metadataPath,
        new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      );

    if (metaUploadError) {
      console.error("Metadata upload error:", metaUploadError);
      // Clean up file if metadata write fails
      await supabase.storage.from("encrypted-files").remove([storagePath]);
      return new Response(
        JSON.stringify({ error: "Failed to save metadata" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ success: true, code }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
