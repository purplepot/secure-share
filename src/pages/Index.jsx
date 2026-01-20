import { useState } from "react";
import { Shield, Lock, Key, FileCheck } from "lucide-react";
import { FileUpload } from "@/components/FileUpload.jsx";
import { FileDownload } from "@/components/FileDownload.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [activeTab, setActiveTab] = useState("upload");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary shadow-md">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">SecureShare</h1>
              <p className="text-xs text-muted-foreground">
                End-to-end encrypted file sharing
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Share Files <span className="text-primary">Securely</span>
            </h2>
            <p className="text-muted-foreground">
              Your files are encrypted with AES-256 before upload. Only the
              recipient with the correct password can decrypt.
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="upload" className="text-sm">
                Upload File
              </TabsTrigger>
              <TabsTrigger value="download" className="text-sm">
                Download File
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="mt-0">
              <FileUpload />
            </TabsContent>
            <TabsContent value="download" className="mt-0">
              <FileDownload />
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-3 gap-4 mt-10">
            <div className="text-center p-4">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium text-sm">AES-256</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Military-grade encryption
              </p>
            </div>
            <div className="text-center p-4">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                <Key className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-medium text-sm">Zero Knowledge</h3>
              <p className="text-xs text-muted-foreground mt-1">
                We never see your password
              </p>
            </div>
            <div className="text-center p-4">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
                <FileCheck className="h-5 w-5 text-warning" />
              </div>
              <h3 className="font-medium text-sm">HMAC Verified</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Integrity guaranteed
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Files are encrypted client-side. Passwords and encryption keys are
            never stored.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
