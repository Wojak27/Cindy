import { TextToSpeechService } from "../main/services/TextToSpeechService";
import * as path from "path";

(async () => {
    try {
        const tts = new TextToSpeechService({
            provider: "xenova",
            xenovaModel: "Xenova/text-to-speech"
        });

        await tts.initialize();

        const outputPath = path.join(process.cwd(), "tts_test_output.wav");
        console.log("[TTS-Test] Synthesizing test phrase to:", outputPath);

        const result = await tts.synthesize("Hello, this is a placeholder embedding TTS test.", outputPath);

        if (result.success) {
            console.log("[TTS-Test] Success! Output at:", result.audioPath, "Duration:", result.duration, "ms");
        } else {
            console.error("[TTS-Test] Failed:", result.error);
        }
    } catch (err) {
        console.error("[TTS-Test] Exception during test:", err);
    }
})();