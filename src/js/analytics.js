export default function initalize(useMock) {
  // Mock analytics on localhost & real analytics on server
  if (useMock) {
    console.log("Mock Google analytics installed");
    window.ga = (...args) => console.log("GA:", ...args.map(arg => arg + " /"));
  } else {
    (function(i, s, o, g, r, a, m) {
      i["GoogleAnalyticsObject"] = r;
      (i[r] =
        i[r] ||
        function() {
          (i[r].q = i[r].q || []).push(arguments);
        }),
        (i[r].l = 1 * new Date());
      (a = s.createElement(o)), (m = s.getElementsByTagName(o)[0]);
      a.async = 1;
      a.src = g;
      m.parentNode.insertBefore(a, m);
    })(window, document, "script", "https://www.google-analytics.com/analytics.js", "ga");
  }

  const ga = window.ga;
  ga("create", "UA-116363382-2", "auto");
  ga("send", "pageview");
}
