import { Platform } from 'obsidian';

/**
 * Utility class for platform detection and mobile-specific adaptations
 * Provides consistent methods for detecting mobile devices and adapting UI accordingly
 */
export class PlatformUtils {
    /**
     * Checks if the current platform is a mobile device (iOS or Android)
     * @returns true if running on iOS or Android
     */
    static isMobile(): boolean {
        return Platform.isAndroidApp || Platform.isIosApp;
    }

    /**
     * Checks if running on iOS specifically
     * @returns true if running on iOS
     */
    static isIOS(): boolean {
        return Platform.isIosApp;
    }

    /**
     * Checks if running on Android specifically
     * @returns true if running on Android
     */
    static isAndroid(): boolean {
        return Platform.isAndroidApp;
    }

    /**
     * Checks if running on desktop (not mobile)
     * @returns true if running on desktop
     */
    static isDesktop(): boolean {
        return !this.isMobile();
    }

    /**
     * Gets appropriate touch target size for current platform
     * Mobile devices need larger touch targets for accessibility
     * @returns minimum touch target size in pixels
     */
    static getTouchTargetSize(): number {
        return this.isMobile() ? 44 : 32; // 44px for mobile (Apple HIG standard)
    }

    /**
     * Gets appropriate modal padding for current platform
     * @returns padding value in rem
     */
    static getModalPadding(): string {
        return this.isMobile() ? '0.5rem' : '1rem';
    }

    /**
     * Gets appropriate font size scaling for mobile
     * @returns font size scaling factor
     */
    static getFontScaling(): number {
        return this.isMobile() ? 1.1 : 1.0;
    }

    /**
     * Determines if modals should be full screen on current platform
     * @returns true if modals should be full screen
     */
    static shouldUseFullScreenModals(): boolean {
        return this.isMobile();
    }

    /**
     * Gets appropriate debounce delay for search operations
     * Mobile devices may need longer delays for performance
     * @returns debounce delay in milliseconds
     */
    static getSearchDebounceDelay(): number {
        return this.isMobile() ? 300 : 150;
    }

    /**
     * Determines maximum number of items to display in lists for performance
     * @returns maximum items to show
     */
    static getMaxDisplayItems(): number {
        return this.isMobile() ? 50 : 100;
    }

    /**
     * Gets CSS classes to apply for mobile-specific styling
     * @returns array of CSS class names
     */
    static getMobileCssClasses(): string[] {
        const classes: string[] = [];
        
        if (this.isMobile()) {
            classes.push('is-mobile');
        }
        
        if (this.isIOS()) {
            classes.push('is-ios');
        }
        
        if (this.isAndroid()) {
            classes.push('is-android');
        }
        
        if (this.isDesktop()) {
            classes.push('is-desktop');
        }
        
        return classes;
    }

    /**
     * Checks if the current screen is likely a tablet vs phone
     * This is a heuristic based on actual viewport dimensions and pixel density
     * @returns true if screen appears to be tablet-sized
     */
    static isTablet(): boolean {
        if (!this.isMobile()) return false;
        
        // Get actual viewport dimensions accounting for device pixel ratio
        const actualWidth = window.innerWidth * (window.devicePixelRatio || 1);
        const actualHeight = window.innerHeight * (window.devicePixelRatio || 1);
        const minDimension = Math.min(actualWidth, actualHeight);
        const maxDimension = Math.max(actualWidth, actualHeight);
        
        // Adjust threshold based on pixel density - higher DPI devices need higher thresholds
        const pixelRatio = window.devicePixelRatio || 1;
        const baseThreshold = 768;
        const adjustedThreshold = baseThreshold * Math.max(1, pixelRatio * 0.8);
        
        // Tablet if minimum dimension exceeds adjusted threshold
        const sizeCheck = minDimension > adjustedThreshold;
        
        // Refined aspect ratio check - tablets typically have more square-like ratios
        // Most phones have aspect ratios > 1.8, tablets are usually between 1.2-1.7
        const aspectRatio = maxDimension / minDimension;
        const aspectCheck = aspectRatio >= 1.2 && aspectRatio <= 1.8;
        
        // Also check for common tablet breakpoints (in CSS pixels)
        const cssWidth = window.innerWidth;
        const cssHeight = window.innerHeight;
        const cssMinDimension = Math.min(cssWidth, cssHeight);
        const commonTabletCheck = cssMinDimension >= 600; // Common tablet breakpoint
        
        // Consider it a tablet if it passes size check AND (aspect ratio check OR common breakpoint)
        return sizeCheck && (aspectCheck || commonTabletCheck);
    }

    /**
     * Gets appropriate grid columns for current screen size
     * @returns number of columns for grid layouts
     */
    static getGridColumns(): number {
        if (!this.isMobile()) return 3;
        return this.isTablet() ? 2 : 1;
    }

    /**
     * Determines if advanced features should be hidden on mobile for performance
     * @returns true if should use simplified UI
     */
    static shouldUseSimplifiedUI(): boolean {
        return this.isMobile() && !this.isTablet();
    }

    /**
     * Gets appropriate animation duration for current platform
     * Mobile devices may benefit from shorter animations
     * @returns animation duration in milliseconds
     */
    static getAnimationDuration(): number {
        return this.isMobile() ? 200 : 300;
    }

    /**
     * Determines if haptic feedback is available and should be used
     * @returns true if haptic feedback should be used
     */
    static shouldUseHapticFeedback(): boolean {
        return this.isMobile(); // Both iOS and Android support haptic feedback
    }
}
