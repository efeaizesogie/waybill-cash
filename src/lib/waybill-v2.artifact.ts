export default {
  contractName: 'WaybillV2',
  constructorInputs: [
    { name: 'buyerPkh', type: 'bytes20' },
    { name: 'sellerPkh', type: 'bytes20' },
    { name: 'releaseHash', type: 'bytes32' },
    { name: 'refundAfter', type: 'int' },
    { name: 'maxFee', type: 'int' },
    { name: 'feePkh', type: 'bytes20' },
  ],
  abi: [
    {
      name: 'release',
      inputs: [
        { name: 'secret', type: 'bytes' },
      ],
    },
    { name: 'refund', inputs: [] },
  ],
  bytecode: 'OP_6 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_7 OP_ROLL OP_SHA256 OP_3 OP_ROLL OP_EQUALVERIFY OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_UTXOVALUE OP_DUP c800 OP_DIV OP_0 OP_OUTPUTBYTECODE 76a914 OP_5 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_DUP 2202 OP_GREATERTHANOREQUAL OP_IF OP_TXOUTPUTCOUNT OP_2 OP_NUMEQUALVERIFY OP_1 OP_OUTPUTBYTECODE 76a914 OP_7 OP_PICK OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_1 OP_OUTPUTVALUE OP_OVER OP_GREATERTHANOREQUAL OP_VERIFY OP_0 OP_OUTPUTVALUE OP_2 OP_PICK OP_2 OP_PICK OP_SUB OP_6 OP_PICK OP_SUB OP_GREATERTHANOREQUAL OP_VERIFY OP_ELSE OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTVALUE OP_2 OP_PICK OP_6 OP_PICK OP_SUB OP_GREATERTHANOREQUAL OP_VERIFY OP_ENDIF OP_2DROP OP_2DROP OP_2DROP OP_DROP OP_1 OP_ELSE OP_6 OP_ROLL OP_1 OP_NUMEQUALVERIFY OP_3 OP_ROLL OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTBYTECODE 76a914 OP_ROT OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_4 OP_ROLL OP_SUB OP_GREATERTHANOREQUAL OP_NIP OP_NIP OP_NIP OP_ENDIF',
  source: 'pragma cashscript ^0.14.0;\n\n// Waybill v2: pay-on-delivery escrow with a 0.5% platform fee.\n//\n// Same as v1, plus: when the buyer releases the money, 0.5% of the locked amount goes to the\n// Waybill developer (feePkh), taken out of the seller\'s amount. Refunds carry no fee.\n// Orders too small for the fee to clear the dust limit (546 sats) pay no fee.\ncontract WaybillV2(\n    bytes20 buyerPkh,\n    bytes20 sellerPkh,\n    bytes32 releaseHash,\n    int refundAfter,\n    int maxFee,\n    bytes20 feePkh\n) {\n    function release(bytes secret) {\n        require(sha256(secret) == releaseHash);\n        require(tx.inputs.length == 1);\n        int amount = tx.inputs[0].value;\n        int fee = amount / 200;\n        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(sellerPkh));\n        if (fee >= 546) {\n            require(tx.outputs.length == 2);\n            require(tx.outputs[1].lockingBytecode == new LockingBytecodeP2PKH(feePkh));\n            require(tx.outputs[1].value >= fee);\n            require(tx.outputs[0].value >= amount - fee - maxFee);\n        } else {\n            require(tx.outputs.length == 1);\n            require(tx.outputs[0].value >= amount - maxFee);\n        }\n    }\n\n    function refund() {\n        require(tx.time >= refundAfter);\n        require(tx.inputs.length == 1);\n        require(tx.outputs.length == 1);\n        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(buyerPkh));\n        require(tx.outputs[0].value >= tx.inputs[0].value - maxFee);\n    }\n}\n',
  fingerprint: 'eef1659184883f5259637c570e384cb406fa6aa529d4ee4465ac703b5e98dbaa',
  debug: {
    bytecode: '5679009c63577aa8537a88c3519d00c67602c8009600cd0376a914557a7e0288ac7e8876022202a263c4529d51cd0376a91457797e0288ac7e8851cc78a26900cc5279527994567994a26967c4519d00cc5279567994a269686d6d6d755167567a519d537ab175c3519dc4519d00cd0376a9147b7e0288ac7e8800cc00c6547a94a277777768',
    sourceMap: '16:4:31:5;;;;;17:23:17:29;;:16::30:1;:34::45:0;;:8::47:1;18:16:18:32:0;:36::37;:8::39:1;19:31:19:32:0;:21::39:1;20:18:20:24:0;:27::30;:18:::1;21:27:21:28:0;:16::45:1;:49::84:0;:74::83;;:49::84:1;;;:8::86;22:12:22:15:0;:19::22;:12:::1;:24:27:9:0;23:20:23:37;:41::42;:12::44:1;24:31:24:32:0;:20::49:1;:53::85:0;:78::84;;:53::85:1;;;:12::87;25:31:25:32:0;:20::39:1;:43::46:0;:20:::1;:12::48;26:31:26:32:0;:20::39:1;:43::49:0;;:52::55;;:43:::1;:58::64:0;;:43:::1;:20;:12::66;27:15:30:9:0;28:20:28:37;:41::42;:12::44:1;29:31:29:32:0;:20::39:1;:43::49:0;;:52::58;;:43:::1;:20;:12::60;27:15:30:9;16:35:31:5;;;;;:4;33::39::0;;;;34:27:34:38;;:8::40:1;;35:16:35:32:0;:36::37;:8::39:1;36:16:36:33:0;:37::38;:8::40:1;37:27:37:28:0;:16::45:1;:49::83:0;:74::82;:49::83:1;;;:8::85;38:27:38:28:0;:16::35:1;:49::50:0;:39::57:1;:60::66:0;;:39:::1;:8::68;33:22:39:5;;;8:0:40:1',
    logs: [],
    requires: [
      { ip: 16, line: 17 },
      { ip: 19, line: 18 },
      { ip: 33, line: 21 },
      { ip: 40, line: 23 },
      { ip: 49, line: 24 },
      { ip: 54, line: 25 },
      { ip: 66, line: 26 },
      { ip: 70, line: 28 },
      { ip: 79, line: 29 },
      { ip: 93, line: 34 },
      { ip: 97, line: 35 },
      { ip: 100, line: 36 },
      { ip: 108, line: 37 },
      { ip: 117, line: 38 },
    ],
    sourceTags: '111:113:sc',
  },
  compiler: {
    name: 'cashc',
    version: '0.14.0',
    options: {
      enforceFunctionParameterTypes: true,
      enforceLocktimeGuard: true,
    },
  },
  updatedAt: '2026-11-15T03:01:52.107Z',
} as const;
