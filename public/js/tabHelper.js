//public/js is typically for client-side JS 

//example link: /parking/edit?tab=monitor-tab#monitors
//tab=monitor-tab → tells us which tab button ID to activate.
//#monitors → tells us which section ID to scroll to inside the tab.
//POST = res.redirect('/edit?tab=monitor-tab#monitors');

/**
 * Helper: Activates a Bootstrap tab and scrolls to a section inside it.
 * 
 * Expects:
 *   URL like /page?tab=monitor-tab#monitors
 */
function activateTabAndScroll() {
  const params = new URLSearchParams(window.location.search)
  const tabId = params.get('tab') // e.g. "monitor-tab"
  const hash = window.location.hash // e.g. "#monitors"

  if (!tabId) return; // no tab? nothing to do.
  const tabEl = document.getElementById(tabId)
  if (!tabEl) return; // tab button not found.

  const tab = new bootstrap.Tab(tabEl)
  tab.show(); //select tab 

  // If there is a hash, wait for the tab to be visible.
  if (hash) {
    tabEl.addEventListener('shown.bs.tab', () => {
      const section = document.querySelector(hash)
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }
}
// Run on DOM ready
document.addEventListener('DOMContentLoaded', activateTabAndScroll)