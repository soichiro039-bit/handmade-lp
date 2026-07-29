/* =====================================================================
   販路の手数料・振込費用の計算（共有モジュール）
   2026-07-28 開発部が新設。

   【なぜファイルへ出したか】
   資産1（/tools/marketplace-fee-comparison/）の仕様に
   「計算コードは /app/ と同一の関数を使う。2箇所に別実装を置かない」とある。
   だが既に index.html と app/index.html の2枚が同じ式をインラインで持っており、
   3枚目をインラインで書けば**3箇所目の実装**になる。そこでこの1本を作り、
   新しいページはこれを読み込むだけにした（新ページは自分の実装を持たない）。

   【既存2枚をこれへ寄せなかった理由】
   ・原則6の検査は公開中LPのHTMLから `const channels` を正規表現で抜いて照合する。
     外部ファイルへ出した瞬間、災害級の検査が「取得できず」で落ちる
   ・app/ は将来iOSアプリになる前提で、原則11（端末の外へ通信しない）を負っている
   よって既存2枚はインラインのまま据え置き、**このファイルの値が app と一致することを
   機械で突き合わせる**（invariants_check.py 原則27a）。人の目視同期に頼らない。

   値の正本: 07_開発移行/料率マスタ/fee_master_v0.json (data_version 2026-07-28-r46)
   ===================================================================== */
(function (global) {
  "use strict";

  /* 販売手数料。app/index.html の CHANNELS・index.html の channels と同じ値。
     ここへ振込費用の数値を混ぜないこと（原則10・原則6）。 */
  var channels = [
    { key: "minne",   name: "minne",        fee: function (t) { return t * 0.10659; } },
    { key: "creema",  name: "Creema",       fee: function (t) { return t * 0.1067;  } },
    { key: "base",    name: "BASE",         fee: function (t) { return t * 0.066 + 40; } },
    { key: "mercari", name: "メルカリShops", fee: function (t) { return t * 0.10;    } }
  ];

  /* 端数処理（原則21）。販路ごとに丸め方が違う。
     Creemaだけは公式が丸め方向を明記していないため切り上げ＝手数料を多めに見る側へ倒す。
     分からない側へ倒すときは、作家の手取りを多く見せない方向を選ぶ。 */
  var FEE_ROUND = { minne: Math.floor, creema: Math.ceil, base: Math.round, mercari: Math.floor };

  /* 振込にかかる費用（原則10）。CHANNELS とは必ず別に持つ。 */
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

  /** 販路手数料。base は「購入者が払う合計（送料をふくむ）」＝手数料の基数（原則21） */
  function channelFee(key, base) {
    var r = FEE_ROUND[key] || Math.round;
    return base > 0 ? r(find(key).fee(base)) : 0;
  }

  /** 1点あたりが負担する振込費用。振込は月1回・ひと月に n 点売る前提。
      費用が未確認の販路は null を返す（推測値を入れて比較させない＝原則10c）。 */
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

  /* ひと月の入金見込みが下限に届かないと、その月は手元に来ない（原則15）。
     app/index.html の PAYOUT_TIMING[key].minYen と同じ値。
     minne 1,000円・メルカリShops 5,000円 は fee_master の min_payout_jpy が正本。
     BASE 752円 は「売上残高751円以下では振込申請ができない」（help.thebase.in）。
     Creema は下限の定めが無いため 0（＝この判定を行わない）。
     値が app とずれていないことは invariants_check.py 原則27a2 が機械で突き合わせる。 */
  var PAYOUT_MIN = { minne: 1000, creema: 0, base: 752, mercari: 5000 };

  /** その月の入金見込みが下限に届かないとき true（届かない月は繰り越し・申請不可になる） */
  function payoutBelowMin(key, price, shipTop, n) {
    var min = PAYOUT_MIN[key];
    if (!min) { return false; }
    n = Math.max(1, n || 1);
    var gross = Math.max(0, price) + (+shipTop || 0);
    var monthly = Math.max(0, gross - channelFee(key, gross)) * n;
    return price > 0 && monthly < min;
  }

  /* 出典と最終確認日（原則7b・仕様「公式出典と取得日を表示する」）。
     ページ側に数字や日付を直書きせず、必ずここから描画する（原則6/18b）。
     この表の値は fee_master_v0.json と機械で突き合わせる（原則27a）。 */
  var META = {
    /* 【2026-07-28 20時台 法務部】正本が r47 へ進んだのに r46 のままで、公開ページが
       「料率データの版」として古い版を表示していた。r46→r47 は minne PLUS の段階料率を
       正本へ記録しただけで rate / fixed_fee / payout_* は1つも変わっていない（分析部 note_r47・
       法務部が4販路とも本モジュールの値と正本 r47 を突き合わせて一致を実測）。値は据え置きで版だけ更新する。 */
    data_version: "2026-07-29-r49",
    channels: {
      minne: {
        name: "minne", rate: 0.10659, fixed: 0, rateText: "10.659%",
        asof: "2026-07-27", rateConf: "primary",
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
        asof: "2026-07-27", rateConf: "primary",
        rateSrc: "creema.jp/news/1480/detail（公式改定告知）",
        taxBaseConf: "primary",
        taxBaseText: "決済総額（作品＋オプション＋ラッピング＋送料）",
        roundText: "公式に明記がないため切り上げ（手取りを多く見せない側へ倒す）",
        payoutText: "200円／回（振込額3万円以上は275円）", payoutConf: "primary",
        payoutSrc: "creema.jp/news/1480/detail（2025-11-27改定後・全金融機関一律）",
        payoutNote: ""
      },
      base: {
        name: "BASE", rate: 0.066, fixed: 40, rateText: "6.6% ＋ 40円",
        asof: "2026-07-27", rateConf: "primary",
        rateSrc: "help.thebase.in 記事5701758066585",
        taxBaseConf: "unconfirmed",
        taxBaseText: "送料を含む前提で計算（公式に明記が見つかっていません）",
        roundText: "四捨五入",
        payoutText: "250円／回（振込申請額2万円未満はさらに500円）", payoutConf: "primary",
        payoutSrc: "help.thebase.in 記事206341302",
        payoutNote: "売上残高751円以下では振込申請ができません"
      },
      mercari: {
        name: "メルカリShops", rate: 0.10, fixed: 0, rateText: "10%",
        asof: "2026-07-27", rateConf: "primary",
        rateSrc: "support.mercari-shops.com 記事900005534186・900006449763",
        taxBaseConf: "unconfirmed",
        taxBaseText: "送料を含む前提で計算（公式に明記が見つかっていません）",
        roundText: "切り捨て",
        payoutText: "200円／回", payoutConf: "primary",
        payoutSrc: "support.mercari-shops.com 記事900006450663・60017559998361",
        payoutNote: "販売利益5,000円未満の月は次回へ繰り越されます"
      }
    }
  };

  global.FeeCalc = {
    channels: channels,
    FEE_ROUND: FEE_ROUND,
    PAYOUT: PAYOUT,
    channelFee: channelFee,
    payoutPerItem: payoutPerItem,
    grossOf: grossOf,
    PAYOUT_MIN: PAYOUT_MIN,
    payoutBelowMin: payoutBelowMin,
    META: META,
    yen: function (n) { return Math.round(n).toLocaleString() + "円"; }
  };
})(window);
