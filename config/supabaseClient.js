const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('SUPABASE_URL atau SUPABASE_ANON_KEY belum diatur di environment.');
}

const supabaseOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
};

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, supabaseOptions)
  : null;

module.exports = supabase;
module.exports.supabasePublicConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey
};
module.exports.createRequestClient = (accessToken) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    ...supabaseOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
};
