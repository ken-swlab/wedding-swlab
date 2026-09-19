import "server-only";

export async function background(task: Promise<unknown>): Promise<void> {
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(task);
  } catch {
    await task.catch(() => {});
  }
}
