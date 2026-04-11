const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const uploadPhoto = async (fileBuffer, fileName, mimeType) => {
  const filePath = `bhakto-photos/${Date.now()}_${fileName}`;

  const { error } = await supabase.storage
    .from('umandal')
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from('umandal')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

module.exports = { supabase, uploadPhoto };