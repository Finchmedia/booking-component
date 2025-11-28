"use client";
import { useEffect, useRef, useState } from "react";
export const useIntersectionObserver = (options = {}) => {
    const { threshold = 0.1, rootMargin = "500px", // Fetch data 500px before calendar becomes visible
    triggerOnce = true, } = options;
    const [isIntersecting, setIsIntersecting] = useState(false);
    const [hasIntersected, setHasIntersected] = useState(false);
    const elementRef = useRef(null);
    useEffect(() => {
        const element = elementRef.current;
        if (!element)
            return;
        const observer = new IntersectionObserver(([entry]) => {
            const isElementIntersecting = entry.isIntersecting;
            setIsIntersecting(isElementIntersecting);
            if (isElementIntersecting && !hasIntersected) {
                setHasIntersected(true);
                if (triggerOnce) {
                    observer.unobserve(element);
                }
            }
        }, { threshold, rootMargin });
        observer.observe(element);
        return () => {
            observer.unobserve(element);
        };
    }, [threshold, rootMargin, triggerOnce, hasIntersected]);
    return [elementRef, isIntersecting, hasIntersected];
};
//# sourceMappingURL=use-intersection-observer.js.map