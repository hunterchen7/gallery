import { onMount } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { isAuthenticated } from "~/lib/auth";

/** Legacy reorder URL: reordering now lives in the gallery edit overlay. */
export default function ReorderRedirect() {
  const navigate = useNavigate();
  const params = useParams();

  onMount(() => {
    navigate(
      isAuthenticated()
        ? `/${params.id}?edit=1`
        : "/login",
      { replace: true },
    );
  });

  return (
    <main class="flex min-h-screen items-center justify-center bg-zinc-950 font-mono text-violet-300">
      Opening collection editor…
    </main>
  );
}
