# BenDavid OS Vault

This folder is an Obsidian-compatible vault. In Obsidian choose **Open folder as vault** and pick this `vault` folder. It is separate from any vault you already have; BenDavid OS never touches other vaults.

## What lives where

| Folder | Who writes it | Notes |
| --- | --- | --- |
| `Profile/` | You | Your profile, writing preferences, and workflow. Edit freely. |
| `Clients/` | BenDavid OS | Read-only mirrors of client records. Edit clients **in the app**. |
| `Daily Reports/` | BenDavid OS | Created when you click **Save daily report**. Add your own notes at the bottom. |

## The one rule

Client records live in **one** place: the app's data file (`data/bendavid-os.json`). Notes in `Clients/` are copies.

- Edits you make in Obsidian to a `Clients/` note are **not** imported back.
- If you edit a generated note, BenDavid OS stops overwriting it. Newer versions are saved beside it as `<name>.generated.md`, and the app shows a warning.
- Sample records are never written here.

`Clients/` and `Daily Reports/` are excluded from git so client details are never published.
