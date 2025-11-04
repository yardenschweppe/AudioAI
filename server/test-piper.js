const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PIPER_BIN = '/opt/piper/.venv/bin/piper';
const MODEL_PATH = '/opt/piper/voices/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx';
const OUTPUT_PATH = '/var/www/audioai/server/audio-output/test_nodejs.wav';

const testText = "I opened my laptop and checked the weather. A blue bird landed on the balcony for a second. The coffee was ready and I took a deep breath and started the next task. This is a longer text to test if Piper can handle more content. I want to see if the entire text is being read properly or if it stops early. Let me add more sentences to make this test more comprehensive. The weather outside was nice today. I enjoyed my morning coffee while watching the birds. Work was productive and I finished all my tasks on time.";

console.log(`Testing with text: "${testText}"`);
console.log(`Text length: ${testText.length} chars`);

function runPiper(text, modelPath, outPath) {
    return new Promise((resolve, reject) => {
        const textToProcess = String(text || "").trim();
        
        if (!textToProcess) {
            return reject(new Error('Text is empty'));
        }
        
        console.log(`\n🎙️  Running Piper: text_length=${textToProcess.length}`);
        console.log(`   Full text: "${textToProcess}"`);
        
        // CRITICAL FIX: Use input file instead of stdin - Piper doesn't read all text from stdin!
        const tempInputFile = path.join('/tmp', `piper_input_test_${Date.now()}_${Math.floor(Math.random()*1000000)}.txt`);
        
        try {
            // Clean the text
            let cleanedText = textToProcess.replace(/\r?\n/g, ' ');
            cleanedText = cleanedText.replace(/[ \t]+/g, ' ');
            cleanedText = cleanedText.trim();
            
            // Write text to temporary input file
            fs.writeFileSync(tempInputFile, cleanedText, 'utf8');
            
            console.log(`   📝 Using input file: ${tempInputFile}`);
            console.log(`   📝 Text length: ${cleanedText.length} chars`);
            
            const p = spawn(PIPER_BIN, ["-m", modelPath, "-i", tempInputFile, "-f", outPath, "-q"], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            let err = "";
            let out = "";
            
            p.stdout.on("data", (d) => {
                out += d.toString();
            });
            
            p.stderr.on("data", (d) => {
                const errorMsg = d.toString();
                err += errorMsg;
                if (errorMsg.trim()) {
                    console.log(`   Piper stderr: ${errorMsg.trim()}`);
                }
            });

            p.on("close", (code) => {
                // Clean up temporary input file
                try {
                    if (fs.existsSync(tempInputFile)) {
                        fs.unlinkSync(tempInputFile);
                    }
                } catch (cleanupError) {
                    console.warn(`   ⚠️  Could not delete temp input file: ${cleanupError.message}`);
                }
                
                if (out.trim()) {
                    console.log(`   Piper stdout: ${out.trim()}`);
                }
                
                if (code === 0) {
                    console.log(`✅ Piper completed successfully`);
                    
                    if (fs.existsSync(outPath)) {
                        const outputSize = fs.statSync(outPath).size;
                        console.log(`   Output file size: ${outputSize} bytes (${(outputSize / 1024).toFixed(2)} KB)`);
                        
                        // Check duration
                        const { spawnSync } = require('child_process');
                        const ffprobeResult = spawnSync('ffprobe', [
                            '-v', 'quiet',
                            '-print_format', 'json',
                            '-show_format',
                            outPath
                        ], { encoding: 'utf8' });
                        
                        if (ffprobeResult.status === 0 && ffprobeResult.stdout) {
                            const probeData = JSON.parse(ffprobeResult.stdout);
                            if (probeData.format && probeData.format.duration) {
                                const duration = parseFloat(probeData.format.duration);
                                console.log(`   Duration: ${duration.toFixed(2)} seconds`);
                            }
                        }
                    }
                    
                    resolve();
                } else {
                    console.error(`❌ Piper exited with code ${code}, error: ${err || 'No error message'}`);
                    reject(new Error(err || `piper exited ${code}`));
                }
            });
        } catch (error) {
            // Clean up temporary input file on error
            try {
                if (fs.existsSync(tempInputFile)) {
                    fs.unlinkSync(tempInputFile);
                }
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            console.error(`   ❌ Error setting up Piper: ${error.message}`);
            reject(new Error(`Failed to set up Piper: ${error.message}`));
        }
    });
}

async function test() {
    try {
        await runPiper(testText, MODEL_PATH, OUTPUT_PATH);
        console.log('\n✅ Test completed successfully!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

test();

