import { supabase } from '../lib/supabase';

/**
 * Uploads a bank statement to the Supabase storage bucket
 * and returns the public URL.
 * 
 * @param file The file object (File or Blob)
 * @param businessId The ID of the business uploading the file
 * @returns The public URL of the uploaded file
 */
export async function uploadBankStatement(file: File, businessId: string): Promise<string> {
  // Validate file size (50 MB limit)
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File exceeds the 50MB maximum size limit.');
  }

  // Validate file extension
  const validExtensions = ['pdf', 'csv', 'xlsx', 'xls'];
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  
  if (!fileExtension || !validExtensions.includes(fileExtension)) {
    throw new Error(`Unsupported file type. Supported types are: ${validExtensions.join(', ')}`);
  }

  // Generate a unique path: business_id/timestamp_filename
  const timestamp = new Date().getTime();
  // Safe filename, strip special chars
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filePath = `${businessId}/${timestamp}_${safeFileName}`;

  // Upload to Supabase Storage bucket 'bank-statements'
  const { error } = await supabase.storage
    .from('bank-statements')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get the public URL for the file
  const { data: { publicUrl } } = supabase.storage
    .from('bank-statements')
    .getPublicUrl(filePath);

  return publicUrl;
}
