async function checkBundle() {
  const html = await fetch('https://local-video-clip-editor.varmaabhishek97.workers.dev').then(r => r.text());
  console.log('HTML length:', html.length);
  const match = html.match(/src="\/assets\/(index-[^"]+\.js)"/);
  if (match) {
    console.log('Matched script asset:', match[1]);
    const js = await fetch('https://local-video-clip-editor.varmaabhishek97.workers.dev/assets/' + match[1]).then(r => r.text());
    console.log('JS bundle size (bytes):', js.length);
    console.log('✓ Contains "Video Studio Canvas":', js.includes('Video Studio Canvas'));
    console.log('✓ Contains "9:16 Vertical":', js.includes('9:16 Vertical'));
    console.log('✓ Contains "Upload History":', js.includes('Upload History'));
    console.log('✓ Contains "Scheduled Videos":', js.includes('Scheduled Videos'));
    console.log('✓ Contains "Run Auto-Cleanup":', js.includes('Run Auto-Cleanup'));
    console.log('✓ Contains "Stop Generating":', js.includes('Stop Generating'));
    console.log('✓ Contains "Delete Selected":', js.includes('Delete Selected'));
    console.log('✓ Contains "Select All":', js.includes('Select All'));
  } else {
    console.log('No script asset matched');
  }
}
checkBundle().catch(console.error);
