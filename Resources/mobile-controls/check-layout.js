// Run inside the isolated production-bundle preview, with a simulated native grip.
(function () {
  const observe = new MutationObserver(() => {
    if (!document.querySelector('.comment-card')) return;
    observe.disconnect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const failures = [];
      const assert = (ok, message) => { if (!ok) failures.push(message); };
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const footer = rect('.right-pane');
      const pane = rect('.comment-pane');
      const header = rect('.topbar');
      assert(document.documentElement.scrollWidth <= innerWidth, '页面横向溢出');
      assert(footer.bottom <= innerHeight && footer.top >= 0, '底栏超出窗口');
      assert(pane.height >= 70, '正文区域高度不足');
      // Include the 1px divider in the rendered toolbar height.
      if (innerWidth <= 760) assert(header.height <= (innerHeight <= 480 ? 45 : 89), '顶栏高度超出设计范围');
      if (innerWidth <= 760 && innerHeight <= 480) {
        const track = document.querySelector('.topbar-actions');
        assert(track.querySelector('button').getBoundingClientRect().left >= track.getBoundingClientRect().left - 1, '首个选区操作无法滚动到达');
      }
      document.querySelectorAll('.topbar-actions button,.quick-nav-item,.segmented button,.comment-fold-toolbar button,#selection-actions-toggle').forEach(button => {
        const box = button.getBoundingClientRect();
        assert(box.height >= 44 && box.width >= 44, `触摸区域不足：${button.textContent || button.getAttribute('aria-label')}`);
      });
      const more = document.querySelector('#selection-actions-toggle');
      const box = more.getBoundingClientRect();
      assert(box.right <= innerWidth - 48, '更多按钮进入缩放区域');
      const points = [[.5,.5],[.05,.05],[.95,.05],[.05,.95],[.95,.95]];
      points.forEach(([x,y]) => assert(document.elementFromPoint(box.left + box.width*x,box.top + box.height*y)?.closest('button') === more, '更多按钮点击区域被遮挡'));
      const surface = getComputedStyle(more, '::before');
      const inset = parseFloat(surface.top);
      assert(box.height - inset*2 <= 32, '底栏可见背景过大');
      const result = {viewport:`${innerWidth}×${innerHeight}`,dark:new URLSearchParams(location.search).has('dark'),header:Math.round(header.height),pane:Math.round(pane.height),footer:Math.round(footer.height),moreRightGap:Math.round(innerWidth-box.right),failures};
      window.parent.postMessage({type:'mn-mobile-layout-result',result}, '*');
    }));
  });
  observe.observe(document.documentElement, {childList:true,subtree:true});
})();
