import { useState, useRef } from "react";
import { Upload, Lock, Copy, Check, Loader2, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

const generateCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "#";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const FileUpload = () => {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef(null);

  const handleGenerateCode = () => {
    setCode(generateCode());
    setUploadSuccess(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadSuccess(false);
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpload = async () => {
    if (!file || !password || !code) {
      toast.error("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsUploading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        toast.error("Missing Supabase environment variables");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("password", password);
      formData.append("code", code);

      const response = await fetch(`${supabaseUrl}/functions/v1/file-upload`, {
        method: "POST",
        body: formData,
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed check the database");
      }

      setUploadSuccess(true);
      toast.success("File uploaded securely!");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setCode("");
    setPassword("");
    setFile(null);
    setUploadSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="glass shadow-xl">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full gradient-primary shadow-lg">
          <Upload className="h-7 w-7 text-primary-foreground" />
        </div>
        <CardTitle className="text-2xl font-bold">Upload File</CardTitle>
        <CardDescription>Encrypt and share your files securely</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {uploadSuccess ? (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <Check className="h-8 w-8 text-accent" />
            </div>
            <div>
              <p className="font-semibold text-lg">
                File Uploaded Successfully!
              </p>
              <p className="text-muted-foreground text-sm mt-1">
                Share this code with the recipient
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg">
              <code className="text-xl font-mono font-bold tracking-wider">
                {code}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyCode}
                className="h-8 w-8"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button onClick={handleReset} variant="outline" className="mt-4">
              Upload Another File
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="code">Access Code</Label>
              <div className="flex gap-2">
                <Input
                  id="code"
                  value={code}
                  readOnly
                  placeholder="Click generate to create a code"
                  className="font-mono text-lg tracking-wider"
                />
                <Button onClick={handleGenerateCode} variant="secondary">
                  Generate
                </Button>
              </div>
              {code && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCode}
                  className="text-muted-foreground text-xs"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" /> Copy code
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Select File</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/50 ${
                  file ? "border-accent bg-accent/5" : "border-border"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileIcon className="h-5 w-5 text-accent" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-muted-foreground text-sm">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Click to select a file
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Encryption Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a strong password"
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 6 characters. This password will be required to download
                the file.
              </p>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!code || !file || !password || isUploading}
              className="w-full gradient-primary text-primary-foreground shadow-lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Encrypting & Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Securely
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
