const BASE_URL = 'https://local-video-clip-editor-worker.varmaabhishek97.workers.dev';

async function run() {
  const loginRes = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.APP_EMAIL || 'abhiwithpooja0768@gmail.com',
      password: process.env.APP_PASSWORD
    })
  });
  const { token } = await loginRes.json();
  const headers = { 'Authorization': 'Bearer ' + token };
  
  const schedRes = await fetch(BASE_URL + '/api/social/scheduled', { headers });
  const sched = await schedRes.json();
  console.log('=== SCHEDULED JOBS IN D1 ===');
  (sched.scheduled || []).forEach(j => {
    console.log(`[${j.platform.toUpperCase()}] id=${j.id} status=${j.status} scheduled_at=${j.scheduled_at} title="${j.title}"`);
  });

  const histRes = await fetch(BASE_URL + '/api/social/history', { headers });
  const hist = await histRes.json();
  console.log('\n=== LATEST 6 COMPLETED/PUBLISHED JOBS IN D1 ===');
  (hist.history || []).slice(0, 6).forEach(j => {
    const url = j.instagram_post_url || j.facebook_post_url || j.post_url;
    console.log(`[${j.platform.toUpperCase()}] id=${j.id} status=${j.status} published_at=${j.published_at} postUrl=${url} title="${j.title}"`);
  });
}

run().catch(console.error);
