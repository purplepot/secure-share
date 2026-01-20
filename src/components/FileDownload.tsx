import { useState } from "react";
import { Download, Lock, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const FileDownload = () => {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleDownload = async () => {
    if (!code || !password) {
      toast.error("Please enter both code and password");
      return;
    }

    // Ensure code has # prefix
    const formattedCode = code.startsWith("#") ? code : `#${code}`;
    
    if (!/^#[A-Z0-9]{6}$/.test(formattedCode.toUpperCase())) {
      toast.error("Invalid code format. Expected format: #ABC123");
      return;
    }

    setIsDownloading(true);
    setDownloadSuccess(false);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/file-download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: formattedCode.toUpperCase(),
            password,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Download failed");
      }

      // Get filename from header
      const contentDisposition = response.headers.get("Content-Disposition");
      let downloadFileName = "downloaded-file";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          downloadFileName = match[1];
        }
      }
      
      // Fallback to X-Original-Filename header
      const originalFileName = response.headers.get("X-Original-Filename");
      if (originalFileName) {
        downloadFileName = decodeURIComponent(originalFileName);
      }

      setFileName(downloadFileName);

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      toast.success("File downloaded successfully!");
    } catch (error) {
      console.error("Download error:", error);
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleReset = () => {
    setCode("");
    setPassword("");
    setDownloadSuccess(false);
    setFileName("");
  };

  return (
    <Card className="glass shadow-xl">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full gradient-accent shadow-lg">
          <Download className="h-7 w-7 text-accent-foreground" />
        </div>
        <CardTitle className="text-2xl font-bold">Download File</CardTitle>
        <CardDescription>
          Enter code and password to decrypt
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {downloadSuccess ? (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle className="h-8 w-8 text-accent" />
            </div>
            <div>
              <p className="font-semibold text-lg">Download Complete!</p>
              <p className="text-muted-foreground text-sm mt-1">
                {fileName}
              </p>
            </div>
            <Button onClick={handleReset} variant="outline" className="mt-4">
              Download Another File
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="download-code">Access Code</Label>
              <Input
                id="download-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Enter code (e.g., #ABC123)"
                className="font-mono text-lg tracking-wider"
                maxLength={7}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="download-password">Decryption Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="download-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter the password"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                File integrity is verified before decryption. Wrong password or corrupted files will be rejected.
              </p>
            </div>

            <Button
              onClick={handleDownload}
              disabled={!code || !password || isDownloading}
              className="w-full gradient-accent text-accent-foreground shadow-lg"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying & Decrypting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download & Decrypt
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
