// 計測を断る操作「だけ」を持つスクリプト（プライバシーポリシーのページ用）
//
// このファイルがやること／やらないこと
//   やる  : 「?noanalytics=1」「=0」を読んで設定を保存・解除する。
//           保存先は analytics.js と同一のキー・path・有効期限なので、サイト全体に効く。
//   やらない: 閲覧数の計測。ビーコンは一切読み込まない。
//           このページの閲覧は、設定の有無にかかわらず数に入らない。
//
// なぜ analytics.js を読み込ませないか
//   このページは「アクセス解析の対象外」と本文で宣言している。
//   計測を断る手段を案内する以上その処理は要るが、計測そのものを持ち込んではならない。
//
// 保存先を analytics.js と1バイトでも違えると、
// 「このページで断ったのに他のページで計測される」という食い違いが生まれる。
// 変更するときは必ず両方を同時に直すこと。

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
    // 踏んだ閲覧者まで計測から外れて数字が過少になるため
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
  }

  // ここで終わり。ビーコンを読み込む処理は、このファイルには存在しない。
})();
