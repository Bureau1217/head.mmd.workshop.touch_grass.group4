// Browsy's own New Tab page: a clock and a search bar.
// (Chrome doesn't let extensions put things on its built-in New Tab page,
// so we replace it with this one — and Browsy can live here too.)

import './content'; // Browsy himself: the same code the extension puts on every website

const clock = document.getElementById('clock')!;
const date = document.getElementById('date')!;

function showTime() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  date.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}
showTime();
setInterval(showTime, 1000);

// Search with whatever search engine you've chosen in Chrome's settings,
// or go straight to the address if you typed one.
document.getElementById('search')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = document.querySelector<HTMLInputElement>('#q')!.value.trim();
  if (!text) return;
  if (/^[a-z]+:\/\//i.test(text)) location.href = text;                          // https://example.com
  else if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) location.href = `https://${text}`; // example.com
  else chrome.search.query({ text, disposition: 'CURRENT_TAB' });
});
