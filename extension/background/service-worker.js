// formKeep — service worker minimal : badge par onglet (T010, research R9).
// Seul rôle : refléter le nombre de formulaires suivis avec données sur la page.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "PAGE_STATUS" || sender.tab?.id == null) return;
  const count = msg.trackedFormsWithData || 0;
  chrome.action.setBadgeText({
    tabId: sender.tab.id,
    text: count > 0 ? String(count) : "",
  });
  if (count > 0) {
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#0f7a57" });
  }
});
