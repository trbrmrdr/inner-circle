(function () {
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

  function isLocalHost() {
    return LOCAL_HOSTS.has(window.location.hostname);
  }

  function appendOriginalLink() {
    if (!isLocalHost()) return;

    document.querySelectorAll("._2575d7").forEach(nav => {
      if (nav.querySelector('a[href="/original/"]')) return;

      nav.append(document.createTextNode(" / "));

      const link = document.createElement("a");
      link.href = "/original/";
      link.textContent = "OR";
      link.dataset.localOriginalLink = "true";
      nav.append(link);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", appendOriginalLink, { once: true });
  } else {
    appendOriginalLink();
  }
})();
