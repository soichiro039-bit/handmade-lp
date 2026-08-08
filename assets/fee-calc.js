/* =====================================================================
   販路の手数料・振込費用の計算（共有モジュール）

   新しいページはこのファイルを読み込むだけにし、自分の計算式を持たないこと。
   index.html と app/index.html の2枚は同じ式をインラインで持っているが、
   これはページ側HTMLから値を取り出す検査と、外部へ通信しない構成を保つための例外で、
   値がこのファイルと一致することは自動で突き合わせている。人の目視同期に頼らない。

   値の正本は料率マスタ fee_master_v0.json（このリポジトリには含まれない）。

   このヘッダに版番号を書かないこと。下の data_version が唯一の版表示であり、
   2か所に書くと必ず片方が置き去りになる。
   ===================================================================== */
(function (global) {
  "use strict";

  /* 販売手数料。app/index.html の CHANNELS・index.html の channels と同じ値。
     ここへ振込費用の数値を混ぜないこと。 */
  var channels = [
    { key: "minne",   name: "minne",        fee: function (t) { return t * 0.10659; } },
    { key: "creema",  name: "Creema",       fee: function (t) { return t * 0.1067;  } },
    { key: "base",    name: "BASE",         fee: function (t) { return t * 0.066 + 40; } },
    { key: "mercari", name: "メルカリShops", fee: function (t) { return t * 0.10;    } }
  ];

  /* 端数処理。販路ごとに丸め方が違う。
     Creemaだけは公式が丸め方向を明記していないため切り上げ＝手数料を多めに見る側へ倒す。
     分からない側へ倒すときは、作家の手取りを多く見せない方向を選ぶ。 */
  var FEE_ROUND = { minne: Math.floor, creema: Math.ceil, base: Math.round, mercari: Math.floor };

  /* BASEだけは合算を1回丸めてはいけない（2026-08-06）。
     公式は2費目を別々の整数として控除する形を示す（help.thebase.in 記事206418941、
     および記事46610591761177 の計算例＝合計1,000円×5.9%＝59円が単独の整数）。
     四捨五入が明記されているのは「かんたん決済手数料（3.6%＋40円）」の行だけで、
     「サービス利用料（3%）」の行の備考は空＝丸め方向の明記はヘルプ全1,019記事に0件。
     合算（6.6%＋40円）を1回四捨五入すると gross 1〜50,000円のうち12,501条件で1円ずれ、
     うち6,365条件は手数料を少なく＝手取りを多く見せる危険側へ倒れていた
     （独立した2つの実装で同じ値を再現して確認）。
     サービス利用料は明記が無いので切り上げ＝作家の手取りを多く見せない側（Creemaと同じ扱い）。
     ここは base（手数料の基数）を見ないと決まらないので FEE_ROUND では表せない。
     **channels[].fee は逆算のprobeが使うので生の式のまま置く（触らないこと）。** */
  var FEE_EXACT = {
    base: function (t) { return Math.round(t * 0.036 + 40) + Math.ceil(t * 0.03); }
  };

  /* 振込にかかる費用。販売手数料とは必ず別に持つ。 */
  var PAYOUT = {
    minne:   { fee: function () { return 220; }, conf: "primary" },
    creema:  { fee: function (amt) { return amt >= 30000 ? 275 : 200; }, conf: "primary" },
    base:    { fee: function (amt) { return 250 + (amt < 20000 ? 500 : 0); }, conf: "primary" },
    mercari: { fee: function () { return 200; }, conf: "primary" }
  };

  function find(key) {
    for (var i = 0; i < channels.length; i++) { if (channels[i].key === key) { return channels[i]; } }
    return channels[0];
  }

  /** 販路手数料。base は「購入者が払う合計（送料をふくむ）」＝手数料の基数 */
  function channelFee(key, base) {
    if (!(base > 0)) { return 0; }
    if (FEE_EXACT[key]) { return FEE_EXACT[key](base); }
    var r = FEE_ROUND[key] || Math.round;
    return r(find(key).fee(base));
  }

  /** 1点あたりが負担する振込費用。振込は月1回・ひと月に n 点売る前提。
      費用が未確認の販路は null を返す（推測値を入れて比較させない）。 */
  function payoutPerItem(key, price, shipTop, n) {
    var p = PAYOUT[key];
    if (!p || !p.fee) { return null; }
    n = Math.max(1, n || 1);
    var gross = Math.max(0, price) + (+shipTop || 0);
    var monthly = Math.max(0, gross - channelFee(key, gross)) * n; // 月の振込見込み額
    return p.fee(monthly) / n;
  }

  /** 購入者が払う合計。送料別なら作品価格とは別に送料が乗る。送料込みなら価格の中にある */
  function grossOf(price, ship, shipMode) {
    return Math.max(0, price) + (shipMode === "sep" ? Math.max(0, +ship || 0) : 0);
  }

  /** 作家が実際に払う発送の実費（送料＋箱・梱包材）。
      app/index.html の shipActual(w) と同じ規則で、式は写さず同じ分岐をそのまま置く:
      ・送料別のときだけ「そのうち、あなたが実際に払う額」を使う
      ・空欄は「請求額と同じ」であって0円ではない。負・非数も0でなく請求額へ倒す
        （0へ丸めると実費が消え、手取りを多く見せる側へ誤る）
      ・送料込みでは「請求」という概念が無く、上の欄がそのまま実費なので shipCost を使わない */
  function shipActual(ship, shipCost, shipMode) {
    if (shipMode === "sep" && shipCost !== null && shipCost !== undefined && shipCost !== "") {
      var v = +shipCost;
      if (isFinite(v) && v >= 0) { return v; }
    }
    return +ship || 0;
  }

  /* ひと月の入金見込みが下限に届かないと、その月は手元に来ない。
     app/index.html の PAYOUT_TIMING[key].minYen と同じ値。
     minne 1,000円・メルカリShops 5,000円 は料率マスタの min_payout_jpy が正本。
     BASE 752円 は「売上残高751円以下では振込申請ができない」（help.thebase.in）。
     Creema は下限の定めが無いため 0（＝この判定を行わない）。
     値が app とずれていないことは自動で突き合わせる。 */
  var PAYOUT_MIN = { minne: 1000, creema: 0, base: 752, mercari: 5000 };

  /* 下限に届かない月に「何が起きるか」は販路で違う。
     minne と メルカリShops は料率マスタに carryover_note が在る＝繰り越される。
     BASE は繰り越しの記載が無く、振込が申請制で
     「売上残高751円以下だと申請できない」＝その月は申請そのものができない。
     両論併記（「繰り越されるか、申請ができません」）で書くと、BASEを選んだ人に
     放っておけば翌月入ると読める。誤りの向きが読み手に有利な側なので必ず書き分ける。
     ここが元で、index.html の PAYOUT_BELOW は同じ文字列を持つ写し。
     ずれていないことは自動で突き合わせる。 */
  var PAYOUT_BELOW = {
    minne:   "次の月へ繰り越されます",
    creema:  "",
    base:    "その月は振込の申請ができません",
    mercari: "次の月へ繰り越されます"
  };

  /** その月の入金見込みが下限に届かないとき true（届かない月は繰り越し・申請不可になる） */
  function payoutBelowMin(key, price, shipTop, n) {
    var min = PAYOUT_MIN[key];
    if (!min) { return false; }
    n = Math.max(1, n || 1);
    var gross = Math.max(0, price) + (+shipTop || 0);
    var monthly = Math.max(0, gross - channelFee(key, gross)) * n;
    return price > 0 && monthly < min;
  }

  /* 出典と最終確認日。公式出典と取得日を画面に表示するための表。
     ページ側に数字や日付を直書きせず、必ずここから描画する。
     この表の値は料率マスタと機械で突き合わせる。 */
  var META = {
    /* 版だけを更新するときも、この data_version を必ず一緒に動かすこと。
       料率マスタが進んだのにここが古いままだと、画面が古い版を「料率データの版」として表示する。 */
    data_version: "2026-08-06-r57",
    channels: {
      minne: {
        name: "minne", rate: 0.10659, fixed: 0, rateText: "10.659%",
        asof: "2026-07-27", checked: "2026-08-08", rateConf: "primary",
        rateSrc: "help.minne.com 記事4406260070675 ほか3件 ＋ minne.com/lp/getting-started",
        taxBaseConf: "primary",
        taxBaseText: "販売価格＋購入オプション＋送料（ラッピングを含まない）",
        roundText: "切り捨て（公式に明記）",
        payoutText: "220円／回", payoutConf: "primary",
        payoutSrc: "help.minne.com 記事4402120787731・4406260070675",
        payoutNote: "売上合計1,000円未満の月は翌月へ繰り越されます"
      },
      creema: {
        name: "Creema", rate: 0.1067, fixed: 0, rateText: "10.67%",
        asof: "2026-07-27", checked: "2026-08-08", rateConf: "primary",
        rateSrc: "creema.jp/news/1480/detail（公式改定告知）",
        taxBaseConf: "primary",
        taxBaseText: "決済総額（作品＋オプション＋ラッピング＋送料）",
        roundText: "公式に明記がないため切り上げ（残る額を多く見せない側へ倒す）",
        payoutText: "200円／回（振込額3万円以上は275円）", payoutConf: "primary",
        payoutSrc: "creema.jp/news/1480/detail（2025-11-27改定後・全金融機関一律）",
        payoutNote: ""
      },
      base: {
        name: "BASE", rate: 0.066, fixed: 40, rateText: "6.6% ＋ 40円",
        asof: "2026-07-27", checked: "2026-08-08", rateConf: "primary",
        rateSrc: "help.thebase.in 記事5701758066585",
        taxBaseConf: "primary",
        taxBaseText: "1注文ごとの合計金額（送料をふくむ）",
        /* 見出しは実装に合わせてある。合算を1回四捨五入していた間は「四捨五入」とだけ
           名乗っていたが、2費目を別々に丸める形へ変えたので両方を書く（FEE_EXACT を参照）。
           **明記が在る側と無い側の書き分けは変えていない。** */
        roundText: "かんたん決済手数料は四捨五入（公式に明記）、サービス利用料は切り上げ（丸め方向は明記が見つかっていません）",
        payoutText: "250円／回（振込申請額2万円未満はさらに500円）", payoutConf: "primary",
        payoutSrc: "help.thebase.in 記事206341302",
        payoutNote: "売上残高751円以下では振込申請ができません"
      },
      mercari: {
        name: "メルカリShops", rate: 0.10, fixed: 0, rateText: "10%",
        asof: "2026-07-27", checked: "2026-08-08", rateConf: "primary",
        rateSrc: "support.mercari-shops.com 記事900005534186・900006449763",
        taxBaseConf: "primary",
        taxBaseText: "送料別なら商品価格＋送料／送料込みなら商品価格のみ",
        roundText: "切り捨て（公式に明記）",
        payoutText: "200円／回", payoutConf: "primary",
        payoutSrc: "support.mercari-shops.com 記事900006450663・60017559998361",
        payoutNote: "販売利益5,000円未満の月は次回へ繰り越されます"
      }
    }
  };

  global.FeeCalc = {
    channels: channels,
    FEE_ROUND: FEE_ROUND,
    FEE_EXACT: FEE_EXACT,
    PAYOUT: PAYOUT,
    channelFee: channelFee,
    payoutPerItem: payoutPerItem,
    grossOf: grossOf,
    shipActual: shipActual,
    PAYOUT_MIN: PAYOUT_MIN,
    PAYOUT_BELOW: PAYOUT_BELOW,
    payoutBelowMin: payoutBelowMin,
    META: META,
    yen: function (n) { return Math.round(n).toLocaleString() + "円"; }
  };
})(window);
