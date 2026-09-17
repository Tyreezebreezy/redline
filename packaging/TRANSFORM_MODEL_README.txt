REDLINE optional offline Transform model — 0.2.0

This package enables the Concise, Professional, and Academic Transform presets
and the Natural, Professional, and Academic My Voice lanes.
REDLINE performs all rewriting on this computer. It does not use a cloud service
and it does not include a model downloader.

INSTALL

1. Close REDLINE.
2. Extract this package into:
   %LOCALAPPDATA%\com.tyree.redline
3. Confirm this file exists:
   %LOCALAPPDATA%\com.tyree.redline\models\qwen2.5-1.5b-instruct-q4_k_m.gguf
4. Reopen REDLINE. Select text, choose Transform, then choose Check again if the
   panel still reports that the model is unavailable.

MODEL IDENTITY

Model: Qwen2.5-1.5B-Instruct Q4_K_M (official Qwen GGUF)
File: qwen2.5-1.5b-instruct-q4_k_m.gguf
Bytes: 1,117,320,736
SHA-256: 6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e
License: Apache-2.0
Source: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF

REDLINE verifies the model's size before offering Transform and verifies this
SHA-256 value before the first model initialization in each process.

REMOVAL

Close REDLINE, then remove the model file shown above. Your documents and other
REDLINE settings are not stored in the models folder.
