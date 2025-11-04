// Test script to simulate text processing like the plugin does

const text1 = "Hallo! Dies ist ein kurzer Test der deutschen Stimme. Ich hoffe, dass die Aussprache klar und natürlich klingt.";
const text2 = "This is a test with some HTML: <p>Hello world</p> and some &nbsp; entities.";
const text3 = "<!-- wp:paragraph -->\n<p>Test paragraph in Gutenberg block</p>\n<!-- /wp:paragraph -->";

function processText(rawText) {
    console.log('\n=== Processing Text ===');
    console.log('Raw:', rawText);
    console.log('Length:', rawText.length);
    
    // Simulate WordPress processing
    let processed = rawText;
    
    // Strip HTML-like content (basic simulation)
    processed = processed.replace(/<[^>]*>/g, '');
    processed = processed.replace(/<!-- [^>]*-->/g, '');
    
    // Normalize whitespace
    processed = processed.replace(/[ \t]+/g, ' ');
    processed = processed.replace(/\n\s*\n/g, '\n\n');
    processed = processed.trim();
    
    console.log('Processed:', processed);
    console.log('Final length:', processed.length);
    console.log('First 10 char codes:', processed.substring(0, 10).split('').map(c => c.charCodeAt(0)).join(', '));
    
    return processed;
}

console.log('Testing text processing like WordPress plugin does:');
processText(text1);
processText(text2);
processText(text3);

console.log('\n=== Now test with server normalization ===');

function serverNormalize(text) {
    console.log('\nServer normalization:');
    console.log('Before:', text);
    const normalized = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('After:', normalized);
    console.log('Length:', normalized.length);
    return normalized;
}

const test = processText(text1);
serverNormalize(test);

