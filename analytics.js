/**
 * 1NB Analytics — Lightweight cross-app tracking
 * All data stored in localStorage (same origin = shared across all apps)
 * 
 * Tracks: pageviews, time on page, interactions, sources, return visits
 * 
 * Usage: Add <script src="/analytics.js"></script> to every app
 * Admin dashboard reads from localStorage at /admin/
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'onb_analytics';
    const SESSION_KEY = 'onb_session';
    const VISITOR_KEY = 'onb_visitor';

    // Get or create visitor ID
    function getVisitorId() {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    }

    // Get or create session (expires after 30 min inactivity)
    function getSession() {
        const now = Date.now();
        let session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        if (!session || now - session.lastActivity > 30 * 60 * 1000) {
            session = {
                id: 's_' + Math.random().toString(36).substr(2, 9),
                start: now,
                lastActivity: now,
                pageviews: 0
            };
        }
        session.lastActivity = now;
        session.pageviews++;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }

    // Parse app name from URL path
    function getAppName() {
        const path = window.location.pathname.replace(/^\/|\/$/g, '');
        if (!path || path === 'index.html') return '_homepage';
        return path.split('/')[0];
    }

    // Parse UTM params
    function getUtmParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            source: params.get('utm_source') || '',
            medium: params.get('utm_medium') || '',
            campaign: params.get('utm_campaign') || ''
        };
    }

    // Get referrer category
    function getReferrerCategory() {
        const ref = document.referrer;
        if (!ref) return 'direct';
        if (ref.includes('onenightbuild.com')) return 'internal';
        if (ref.includes('google.') || ref.includes('bing.') || ref.includes('duckduckgo.')) return 'search';
        if (ref.includes('twitter.com') || ref.includes('x.com')) return 'twitter';
        if (ref.includes('reddit.com')) return 'reddit';
        if (ref.includes('facebook.com') || ref.includes('instagram.com')) return 'social';
        if (ref.includes('t.co')) return 'twitter';
        return 'referral';
    }

    // Load analytics data
    function loadData() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch { return {}; }
    }

    // Save analytics data
    function saveData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch { /* storage full */ }
    }

    // Get today's date key
    function today() {
        return new Date().toISOString().split('T')[0];
    }

    // Initialize app entry in data
    function ensureApp(data, app) {
        if (!data.apps) data.apps = {};
        if (!data.apps[app]) {
            data.apps[app] = {
                firstSeen: today(),
                totalViews: 0,
                uniqueVisitors: new Set(),
                dailyViews: {},
                interactions: {},
                sources: {},
                avgTimeOnPage: 0,
                totalTimeOnPage: 0,
                completedSessions: 0,
                shares: 0,
                affiliateClicks: 0
            };
        }
        // Fix: Sets don't survive JSON serialization
        if (Array.isArray(data.apps[app].uniqueVisitors)) {
            data.apps[app].uniqueVisitors = new Set(data.apps[app].uniqueVisitors);
        } else if (!(data.apps[app].uniqueVisitors instanceof Set)) {
            data.apps[app].uniqueVisitors = new Set();
        }
        return data.apps[app];
    }

    // Pre-save: convert Sets to Arrays for JSON
    function prepareForSave(data) {
        if (!data.apps) return data;
        const clean = JSON.parse(JSON.stringify(data, (key, value) => {
            if (value instanceof Set) return [...value];
            return value;
        }));
        return clean;
    }

    // ============== TRACKING ==============

    const visitorId = getVisitorId();
    const session = getSession();
    const appName = getAppName();
    const dateKey = today();
    const utm = getUtmParams();
    const refCategory = getReferrerCategory();
    const pageLoadTime = Date.now();

    // Skip tracking for admin page
    if (appName === 'admin') return;

    // Record pageview
    const data = loadData();
    const app = ensureApp(data, appName);

    app.totalViews++;
    app.uniqueVisitors.add(visitorId);
    app.dailyViews[dateKey] = (app.dailyViews[dateKey] || 0) + 1;

    // Track source
    const sourceKey = utm.source || refCategory;
    if (!app.sources[sourceKey]) app.sources[sourceKey] = 0;
    app.sources[sourceKey]++;

    // Global stats
    if (!data.global) data.global = { totalViews: 0, dailyViews: {}, uniqueVisitors: [] };
    data.global.totalViews++;
    data.global.dailyViews[dateKey] = (data.global.dailyViews[dateKey] || 0) + 1;
    if (!data.global.uniqueVisitors.includes(visitorId)) {
        data.global.uniqueVisitors.push(visitorId);
    }

    saveData(prepareForSave(data));

    // ============== PUBLIC API ==============

    // Track custom interactions
    window.onbTrack = function(eventName, metadata) {
        const data = loadData();
        const app = ensureApp(data, appName);
        if (!app.interactions[eventName]) app.interactions[eventName] = 0;
        app.interactions[eventName]++;
        saveData(prepareForSave(data));
    };

    // Track affiliate clicks
    window.onbAffiliateClick = function(productName) {
        const data = loadData();
        const app = ensureApp(data, appName);
        app.affiliateClicks++;
        if (!app.interactions['affiliate_click']) app.interactions['affiliate_click'] = 0;
        app.interactions['affiliate_click']++;
        saveData(prepareForSave(data));
    };

    // Track shares
    window.onbShare = function(platform) {
        const data = loadData();
        const app = ensureApp(data, appName);
        app.shares++;
        if (!app.interactions['share_' + (platform || 'unknown')]) app.interactions['share_' + (platform || 'unknown')] = 0;
        app.interactions['share_' + (platform || 'unknown')]++;
        saveData(prepareForSave(data));
    };

    // Track quiz/game completion
    window.onbComplete = function(score, maxScore) {
        const data = loadData();
        const app = ensureApp(data, appName);
        app.completedSessions++;
        if (!app.interactions['completed']) app.interactions['completed'] = 0;
        app.interactions['completed']++;
        if (score !== undefined) {
            if (!app.interactions['scores']) app.interactions['scores'] = [];
            if (Array.isArray(app.interactions['scores'])) {
                app.interactions['scores'].push({ score, max: maxScore, date: dateKey });
                // Keep last 100 scores
                if (app.interactions['scores'].length > 100) {
                    app.interactions['scores'] = app.interactions['scores'].slice(-100);
                }
            }
        }
        saveData(prepareForSave(data));
    };

    // ============== TIME ON PAGE ==============

    // Record time on page when user leaves
    function recordTimeOnPage() {
        const timeSpent = Math.round((Date.now() - pageLoadTime) / 1000);
        if (timeSpent < 1 || timeSpent > 3600) return; // Ignore < 1s or > 1hr

        const data = loadData();
        const app = ensureApp(data, appName);
        app.totalTimeOnPage += timeSpent;
        app.completedSessions = (app.completedSessions || 0);
        const viewCount = app.totalViews || 1;
        app.avgTimeOnPage = Math.round(app.totalTimeOnPage / viewCount);
        saveData(prepareForSave(data));
    }

    window.addEventListener('beforeunload', recordTimeOnPage);
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) recordTimeOnPage();
    });

    // ============== AUTO-TRACK AFFILIATE LINKS ==============

    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (!link) return;
        const href = link.href || '';
        
        // Track Amazon affiliate clicks
        if (href.includes('amazon.com') || href.includes('amzn.to')) {
            window.onbAffiliateClick('amazon');
        }
        // Track any external link as a conversion
        if (href.includes('http') && !href.includes('onenightbuild.com')) {
            window.onbTrack('external_click');
        }
    });

    console.log(`📊 1NB Analytics loaded for: ${appName}`);
})();
