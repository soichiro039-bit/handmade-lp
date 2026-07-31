// Cloudflare Web Analytics（アクセス数計測・クッキーレス）
//
// 【2026-07-31 開発部】index.html へ直書きしていたものを、ここへ切り出した。
// 理由＝tester.html にも計測が要る（分析部の異議）が、**写すと opt-out の
// 判定が2箇所になる**。片方だけ直る二重実装は、Web版とiOS版で実際に起きた型。
// 計測を足すページは、このファイルを読むだけにすること。
//
// 社内アクセスの除外（2026-07-26 統括）
// 「?noanalytics=1」を付けて一度開いた端末では、以後この計測を読み込まない。
// 解除は「?noanalytics=0」。端末ごとに1回ずつ必要
// （PC / iPhoneのSafari / Instagramアプリ内ブラウザ）。
//
// 規約ページ（privacy.html）には**意図的に入れていない**。
// 閲覧数を事業判断に使わないため、写す利益より食い違う害の方が大きい。

(function () {
  var KEY = "meipla_noanalytics";
  var q = new URLSearchParams(location.search).get("noanalytics");

  function setFlag(on) {
    try {
      if (on) { localStorage.setItem(KEY, "1"); } else { localStorage.removeItem(KEY); }
    } catch (e) { /* プライベートモード等でlocalStorageが使えなくてもCookie側で成立させる */ }
    // Instagram等のアプリ内ブラウザはlocalStorageが消えることがあるためCookieにも二重で持つ
    document.cookie = KEY + "=" + (on ? "1" : "") + ";path=/;max-age=" + (on ? 63072000 : 0) + ";SameSite=Lax";
  }

  function hasFlag() {
    try { if (localStorage.getItem(KEY) === "1") { return true; } } catch (e) {}
    return document.cookie.indexOf(KEY + "=1") !== -1;
  }

  if (q === "1" || q === "0") {
    setFlag(q === "1");
    // アドレスバーからクエリを消す。noanalytics=1 付きのURLがそのまま共有・コピペされると、
    // 踏んだ一般の閲覧者まで計測から外れて数字が過少になるため（統括X指摘・2026-07-26）
    try {
      history.replaceState(null, "", location.pathname + location.hash);
    } catch (e) { /* file:// 等でreplaceStateが使えない環境では何もしない */ }
  }

  if (hasFlag()) {
    // 効いていることを自分の目で確認できるよう、画面隅に小さく出す
    var badge = document.createElement("div");
    badge.textContent = "計測OFF";
    badge.setAttribute("style", "position:fixed;right:6px;bottom:6px;z-index:9999;font-size:11px;line-height:1;padding:4px 6px;border-radius:4px;background:rgba(0,0,0,.55);color:#fff;font-family:sans-serif;pointer-events:none");
    document.body.appendChild(badge);
    return; // ビーコンを読み込まない＝この端末の閲覧は数に入らない
  }

  var s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", '{"token": "c562137589a5429b8c1b2c456441f9ca"}');
  document.head.appendChild(s);
})();
