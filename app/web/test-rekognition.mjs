import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";
import { config } from "dotenv";

// .env.local を読み込む
config({ path: ".env.local" });

const client = new RekognitionClient({
  region: process.env.AWS_REGION || "ap-northeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function runTest() {
  console.log("⏳ テスト開始...");
  
  // テスト用のフリー素材（男性の顔写真）を取得
  console.log("📸 サンプル画像をダウンロード中...");
  const imageUrl = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=800&auto=format&fit=crop";
  const res = await fetch(imageUrl);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // AWS Rekognition に送信
  console.log("☁️ AWS Rekognition で顔を解析中...");
  const command = new DetectFacesCommand({
    Image: { Bytes: buffer },
  });

  try {
    const response = await client.send(command);
    console.log("\n✅ 解析成功！");
    console.log(`検出された顔の数: ${response.FaceDetails.length}人`);
    
    if (response.FaceDetails.length > 0) {
      console.log("--- 最初の顔の座標データ (BoundingBox) ---");
      console.log(response.FaceDetails[0].BoundingBox);
      console.log("------------------------------------------");
      console.log("🎉 これでAWSとの連携は完璧です！");
    }
  } catch (err) {
    console.error("\n❌ エラーが発生しました:");
    console.error(err.message);
    console.error("設定したキーや .env.local の内容をもう一度確認してください。");
  }
}

runTest();
