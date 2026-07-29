<#
.SYNOPSIS
    Purges a Git repository's commit history to securely remove an information leak.

.DESCRIPTION
    This script completely wipes the local and remote commit history of a git repository, 
    starting fresh with a new single commit. It is designed to remove sensitive information 
    that was accidentally committed. It will:
    1. Create a temporary orphan branch to start with a clean slate.
    2. Stage all current files in the directory.
    3. Create a fresh initial commit with a clear security-related message.
    4. Delete the existing default branch (detects 'main' or 'master').
    5. Rename the temporary orphan branch to be the new default branch.
    6. Force push the new, clean history to the remote origin repository.
    7. Immediately run local Git garbage collection and reflog expiration.
#>

param(
    [string]$CommitMessage = "Security Update: Purged repository history to remove sensitive information"
)

# Set error action to stop on errors (except for native git commands which we check with $LASTEXITCODE)
$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Red
Write-Host "WARNING: GIT HISTORY PURGE SCRIPT" -ForegroundColor Red
Write-Host "This script will completely DESTROY your git commit history." -ForegroundColor Red
Write-Host "It will overwrite the remote repository history permanently." -ForegroundColor Red
Write-Host "============================================================" -ForegroundColor Red
Write-Host ""

# Check if git is installed
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not in the system PATH."
    exit 1
}

# Check if we are currently inside a git repository
if (-not (Test-Path ".git")) {
    Write-Error "Current directory is not the root of a git repository. Please run this script from the repository root."
    exit 1
}

# Prompt user for final confirmation
$confirm = Read-Host "Are you absolutely sure you want to proceed? Type 'YES' to continue"
if ($confirm -cne "YES") {
    Write-Host "Operation cancelled by user." -ForegroundColor Yellow
    exit 0
}

# Determine default branch (defaults to 'main', checks if 'master' is used instead)
$defaultBranch = "main"
$branches = git branch --list
if ($branches -match "master" -and ($branches -notmatch "main")) {
    $defaultBranch = "master"
}

Write-Host "`nDetected default branch: $defaultBranch" -ForegroundColor Cyan

try {
    # 1. Create and switch to a temporary orphan branch
    Write-Host "1. Creating temporary orphan branch..." -ForegroundColor Cyan
    git checkout --orphan temp_branch_for_purge
    if ($LASTEXITCODE -ne 0) { throw "Failed to create orphan branch." }

    # 2. Stage all current files in the directory
    Write-Host "2. Staging all files..." -ForegroundColor Cyan
    git add -A
    if ($LASTEXITCODE -ne 0) { throw "Failed to stage files." }

    # 3. Create a fresh initial commit
    Write-Host "3. Creating fresh initial commit..." -ForegroundColor Cyan
    git commit -m $CommitMessage
    if ($LASTEXITCODE -ne 0) { throw "Failed to commit staged files." }

    # 4. Delete the existing default branch
    Write-Host "4. Deleting existing default branch ($defaultBranch)..." -ForegroundColor Cyan
    git branch -D $defaultBranch
    if ($LASTEXITCODE -ne 0) { 
        Write-Host "Warning: Failed to delete $defaultBranch. It might not exist locally, continuing anyway..." -ForegroundColor Yellow 
    }

    # 5. Rename the temporary orphan branch to be the new default branch
    Write-Host "5. Renaming temporary branch to $defaultBranch..." -ForegroundColor Cyan
    git branch -m $defaultBranch
    if ($LASTEXITCODE -ne 0) { throw "Failed to rename branch." }

    # 6. Force push the new, clean history to the remote origin repository
    Write-Host "6. Force pushing to remote origin..." -ForegroundColor Cyan
    $pushConfirm = Read-Host "Ready to force push to origin. Type 'PUSH' to execute"
    if ($pushConfirm -cne "PUSH") {
        Write-Host "Force push cancelled by user. Local history is modified, but remote is untouched." -ForegroundColor Yellow
        exit 0
    }
    git push -f origin $defaultBranch
    if ($LASTEXITCODE -ne 0) { throw "Failed to force push to remote." }

    # 7. Run local Git garbage collection and reflog expiration
    Write-Host "7. Running garbage collection and expiring reflog to permanently purge local cache..." -ForegroundColor Cyan
    git reflog expire --expire=now --all
    git gc --prune=now --aggressive
    if ($LASTEXITCODE -ne 0) { throw "Failed to run garbage collection." }

    Write-Host "`nGit history purge completed successfully!" -ForegroundColor Green

} catch {
    Write-Error "An error occurred during the purge process: $_"
    Write-Host "The script encountered a problem. Manual intervention may be required to fix the repository state." -ForegroundColor Yellow
}
