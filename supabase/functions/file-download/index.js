import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    ["decrypt"],
  );
}

// Verify HMAC for integrity
async function verifyHmac(data, password, salt, expectedHmac) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + arrayToBase64(salt)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", keyMaterial, data);
  const computedHmac = arrayToBase64(new Uint8Array(signature));

  return computedHmac === expectedHmac;
}

// Decrypt file using AES-GCM
async function decryptFile(data, key, iv) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new Uint8Array(decrypted);
}

function arrayToBase64(arr) {
  return btoa(String.fromCharCode(...arr));
}

function base64ToArray(base64) {
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load metadata from storage (no MongoDB)
    const codeKey = code.substring(1);
    const metadataPath = `codes/${codeKey}.json`;
    const { data: metadataBlob, error: metadataError } = await supabase.storage
      .from("encrypted-files")
      .download(metadataPath);

    if (metadataError || !metadataBlob) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metadataText = await metadataBlob.text();
    const fileMetadata = JSON.parse(metadataText);

    if (
      !fileMetadata?.storagePath ||
      !fileMetadata?.salt ||
      !fileMetadata?.hmac
    ) {
      return new Response(JSON.stringify({ error: "Corrupt metadata" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download encrypted file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("encrypted-files")
      .download(fileMetadata.storagePath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to retrieve file" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Convert blob to Uint8Array
    const combinedData = new Uint8Array(await fileData.arrayBuffer());

    // Convert salt from base64
    const salt = base64ToArray(fileMetadata.salt);

    // Verify HMAC BEFORE decryption (integrity check)
    const isValid = await verifyHmac(
      combinedData,
      password,
      salt,
      fileMetadata.hmac,
    );
    if (!isValid) {
      return new Response(
        JSON.stringify({
          error: "Integrity check failed. Wrong password or file corrupted.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Extract IV (first 12 bytes) and encrypted data
    const iv = combinedData.slice(0, 12);
    const encryptedData = combinedData.slice(12);

    // Derive decryption key
    const key = await deriveKey(password, salt);

    // Decrypt file
    let decryptedData;
    try {
      decryptedData = await decryptFile(encryptedData, key, iv);
    } catch (decryptError) {
      console.error("Decryption error:", decryptError);
      return new Response(
        JSON.stringify({ error: "Decryption failed. Wrong password." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const originalFileName = fileMetadata.originalFileName;

    // Return decrypted file with original filename
    return new Response(decryptedData, {
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
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
