// Type declarations for Deno runtime in Supabase Edge Functions
declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
    function set(key: string, value: string): void;
  }
  function serve(handler: (req: Request) => Promise<Response> | Response): void;
}

declare module "jsr:@supabase/functions-js/edge-runtime.d.ts" {}
declare module "npm:@supabase/supabase-js" {
  export * from "@supabase/supabase-js";
}
declare module "npm:@supabase/supabase-js@*" {
  export * from "@supabase/supabase-js";
}
