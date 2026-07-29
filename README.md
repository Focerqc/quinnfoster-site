# Quinn Foster - Personal Website Hub

A minimalist, high-performance personal website hub hosted on **Cloudflare Pages**, built with plain HTML5, CSS3, and vanilla JavaScript.

## Features
- **Bio Section**: Comprehensive bio covering Quinn's background in PEV building, hardware repair, community problem-solving, and hands-on engineering.
- **Interactive Experiences**: Visitor web tools for guests to interact with and try out:
  - **Experience 1**: STL Generator interactive tool.
  - **Experience 2**: Placeholder interactive experience.
- **Responsive Navigation Bar**: Tabbed navigation switching between Bio, Experience 1, and Experience 2.
- **Glassmorphism Design System**: Modern dark theme with CSS custom properties, custom typography, micro-interactions, and mobile responsive drawer.
- **Cloudflare Pages Ready**: Static zero-dependency codebase ready for instant deployment.

## GitHub & Cloudflare Pages Deployment Guide

### 1. Link to Your Remote GitHub Repository
Run the following terminal commands in PowerShell to connect your local commit to your GitHub remote repository:

```powershell
# Add your GitHub repository as the origin remote (replace with your actual GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Set the primary branch name to main
git branch -M main

# Push your code to GitHub
git push -u origin main
```

### 2. Connect to Cloudflare Pages
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your GitHub repository (`YOUR_REPO_NAME`).
4. Set the build settings:
   - **Framework preset**: `None`
   - **Build command**: *(leave empty)*
   - **Build output directory**: `/` (or leave default root)
5. Click **Save and Deploy**. Cloudflare Pages will automatically deploy your site on every `git push`!
