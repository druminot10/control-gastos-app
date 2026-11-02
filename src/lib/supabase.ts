import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  throw new Error(
    "Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY juntos en tu archivo .env.",
  );
}

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient<Database>(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
