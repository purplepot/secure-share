-- Create storage bucket for encrypted files
INSERT INTO storage.buckets (id, name, public)
VALUES ('encrypted-files', 'encrypted-files', false);

-- Allow authenticated and anonymous uploads
CREATE POLICY "Allow uploads to encrypted-files"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'encrypted-files');

-- Allow reading files from encrypted-files bucket
CREATE POLICY "Allow reading from encrypted-files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'encrypted-files');