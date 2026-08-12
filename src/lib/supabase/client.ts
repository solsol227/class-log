import { createClient } from "@supabase/supabase-js";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.example을 참고해 .env.local을 설정해 주세요.",
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
