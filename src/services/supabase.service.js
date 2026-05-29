const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const uploadPhoto = async (fileBuffer, fileName, mimeType) => {
  // Compress: max 800×800, JPEG quality 82, strip EXIF metadata
  const compressed = await sharp(fileBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const baseName = fileName.replace(/\.\w+$/, '');
  const filePath = `bhakto-photos/${Date.now()}_${baseName}.jpg`;

  const { error } = await supabase.storage
    .from('umandal')
    .upload(filePath, compressed, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from('umandal')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

module.exports = { supabase, uploadPhoto };