export default {
  contractName: 'Waybill',
  constructorInputs: [
    { name: 'buyerPkh', type: 'bytes20' },
    { name: 'sellerPkh', type: 'bytes20' },
    { name: 'releaseHash', type: 'bytes32' },
    { name: 'refundAfter', type: 'int' },
    { name: 'maxFee', type: 'int' },
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
  bytecode: 'OP_5 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_6 OP_ROLL OP_SHA256 OP_3 OP_ROLL OP_EQUALVERIFY OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTBYTECODE 76a914 OP_3 OP_ROLL OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_4 OP_ROLL OP_SUB OP_GREATERTHANOREQUAL OP_NIP OP_NIP OP_NIP OP_ELSE OP_5 OP_ROLL OP_1 OP_NUMEQUALVERIFY OP_3 OP_ROLL OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY OP_0 OP_OUTPUTBYTECODE 76a914 OP_ROT OP_CAT 88ac OP_CAT OP_EQUALVERIFY OP_0 OP_OUTPUTVALUE OP_0 OP_UTXOVALUE OP_4 OP_ROLL OP_SUB OP_GREATERTHANOREQUAL OP_NIP OP_NIP OP_ENDIF',
  source: 'pragma cashscript ^0.14.0;\n\n// Waybill: pay-on-delivery escrow with no arbiter.\n//\n// The buyer locks BCH here. At handover the buyer reveals a 16-byte secret\n// (shown as a QR code). Anyone holding the secret can trigger `release`,\n// but the covenant only lets the money go to the seller. If nothing is\n// released before `refundAfter` (block height), anyone can trigger `refund`,\n// and the covenant only lets the money go back to the buyer.\n// No signatures are needed for either path, so the courier/seller and the\n// buyer never have to connect a wallet to settle.\ncontract Waybill(\n    bytes20 buyerPkh,\n    bytes20 sellerPkh,\n    bytes32 releaseHash,\n    int refundAfter,\n    int maxFee\n) {\n    function release(bytes secret) {\n        require(sha256(secret) == releaseHash);\n        require(tx.inputs.length == 1);\n        require(tx.outputs.length == 1);\n        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(sellerPkh));\n        require(tx.outputs[0].value >= tx.inputs[0].value - maxFee);\n    }\n\n    function refund() {\n        require(tx.time >= refundAfter);\n        require(tx.inputs.length == 1);\n        require(tx.outputs.length == 1);\n        require(tx.outputs[0].lockingBytecode == new LockingBytecodeP2PKH(buyerPkh));\n        require(tx.outputs[0].value >= tx.inputs[0].value - maxFee);\n    }\n}\n',
  fingerprint: '74dba9a6b11e321b2f71e7d50685c692d96cbcbf5fab66ddf2cf2a64fe4305dc',
  debug: {
    bytecode: '5579009c63567aa8537a88c3519dc4519d00cd0376a914537a7e0288ac7e8800cc00c6547a94a277777767557a519d537ab175c3519dc4519d00cd0376a9147b7e0288ac7e8800cc00c6547a94a2777768',
    sourceMap: '19:4:25:5;;;;;20:23:20:29;;:16::30:1;:34::45:0;;:8::47:1;21:16:21:32:0;:36::37;:8::39:1;22:16:22:33:0;:37::38;:8::40:1;23:27:23:28:0;:16::45:1;:49::84:0;:74::83;;:49::84:1;;;:8::86;24:27:24:28:0;:16::35:1;:49::50:0;:39::57:1;:60::66:0;;:39:::1;:8::68;19:35:25:5;;;:4;27::33::0;;;;28:27:28:38;;:8::40:1;;29:16:29:32:0;:36::37;:8::39:1;30:16:30:33:0;:37::38;:8::40:1;31:27:31:28:0;:16::45:1;:49::83:0;:74::82;:49::83:1;;;:8::85;32:27:32:28:0;:16::35:1;:49::50:0;:39::57:1;:60::66:0;;:39:::1;:8::68;27:22:33:5;;12:0:34:1',
    logs: [],
    requires: [
      { ip: 15, line: 20 },
      { ip: 18, line: 21 },
      { ip: 21, line: 22 },
      { ip: 30, line: 23 },
      { ip: 39, line: 24 },
      { ip: 49, line: 28 },
      { ip: 53, line: 29 },
      { ip: 56, line: 30 },
      { ip: 64, line: 31 },
      { ip: 73, line: 32 },
    ],
    sourceTags: '34:36:sc;68:69:sc',
  },
  compiler: {
    name: 'cashc',
    version: '0.14.0',
    options: {
      enforceFunctionParameterTypes: true,
      enforceLocktimeGuard: true,
    },
  },
  updatedAt: '2026-11-14T10:54:38.707Z',
} as const;
