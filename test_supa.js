import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log("URL:", supabaseUrl);
console.log("KEY length:", supabaseKey.length);

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success! Data length:", data.length);
  }
}
test();
