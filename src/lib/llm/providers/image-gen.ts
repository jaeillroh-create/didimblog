import OpenAI from "openai";

interface GenerateImageResult {
  url: string;
  revisedPrompt: string;
}

export async function generateImage(
  apiKey: string,
  prompt: string,
  size: "1024x1024" | "1024x1792" | "1792x1024" = "1024x1024"
): Promise<GenerateImageResult> {
  const client = new OpenAI({ apiKey });

  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size,
    quality: "standard",
    response_format: "b64_json",
  });

  const imageData = response.data?.[0];
  if (!imageData?.b64_json) {
    throw new Error("이미지 생성 결과를 받지 못했습니다.");
  }

  return {
    url: imageData.b64_json,
    revisedPrompt: imageData.revised_prompt || prompt,
  };
}
