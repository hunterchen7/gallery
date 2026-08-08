import { onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { isAuthenticated } from "~/lib/auth";

/** Legacy admin URL: editing now lives directly on the gallery. */
export default function AdminRedirect() {
  const navigate = useNavigate();

  onMount(() => {
    navigate(isAuthenticated() ? "/?edit=1" : "/login", { replace: true });
  });

  return (
    <main class="flex min-h-screen items-center justify-center bg-zinc-950 font-mono text-violet-300">
      Opening gallery editor…
    </main>
  );
}
