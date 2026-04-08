import { runGeneration } from "@/lib/generation-runner";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { generationId } = await req.json();

  if (!generationId || typeof generationId !== "number") {
    return Response.json({ error: "generationId가 필요합니다." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(data: { status: string; message: string }) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send({ status: "generating", message: "LLM 호출 중..." });

        const result = await runGeneration(generationId);

        if (result.success) {
          send({ status: "completed", message: "생성 완료" });
        } else {
          send({ status: "failed", message: result.error || "생성 실패" });
        }
      } catch (e) {
        send({ status: "failed", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
