/**
 * Get current time context
 */
export function getTimeContext() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const month = now.getMonth();

    return {
        hour,
        time_of_day: getTimeOfDay(hour),
        day_of_week: getDayOfWeek(day),
        is_weekend: isWeekend(day),
        season: getSeason(month)
    };
}

/**
 * Get time of day slot
 */
function getTimeOfDay(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

/**
 * Get day of week name
 */
function getDayOfWeek(day) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[day];
}

/**
 * Check if weekend
 */
function isWeekend(day) {
    return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Get season (for India)
 */
function getSeason(month) {
    if (month >= 2 && month <= 5) return 'summer'; // March-June
    if (month >= 6 && month <= 9) return 'monsoon'; // July-October
    return 'winter'; // November-February
}

/**
 * Apply time-based scoring to restaurants
 */
export function applyTimeScoring(restaurants, timeContext) {
    return restaurants.map(restaurant => {
        let timeScore = 0;

        // Morning (6 AM - 12 PM)
        if (timeContext.time_of_day === 'morning') {
            // Boost breakfast places
            if (restaurant.tags?.includes('tiffin') || restaurant.tags?.includes('breakfast')) {
                timeScore += 15;
            }
            // Boost cafes
            if (restaurant.tags?.includes('cafe') || restaurant.cuisines?.includes('Cafe')) {
                timeScore += 10;
            }
            // Check opening hours
            if (restaurant.opening_hours?.includes('06:') || restaurant.opening_hours?.includes('07:')) {
                timeScore += 5;
            }
        }

        // Afternoon (12 PM - 5 PM)
        if (timeContext.time_of_day === 'afternoon') {
            // Boost lunch specials
            if (restaurant.tags?.includes('thali') || restaurant.tags?.includes('buffet')) {
                timeScore += 10;
            }
            // Boost quick service
            if (restaurant.tags?.includes('quick-service') || restaurant.tags?.includes('fast-food')) {
                timeScore += 8;
            }
        }

        // Evening (5 PM - 9 PM)
        if (timeContext.time_of_day === 'evening') {
            // Boost dinner spots
            if (restaurant.tags?.includes('family') || restaurant.tags?.includes('fine-dining')) {
                timeScore += 10;
            }
            // Boost restaurants with good ambiance
            if (restaurant.tags?.includes('aesthetic') || restaurant.tags?.includes('lounge')) {
                timeScore += 8;
            }
        }

        // Night (9 PM - 6 AM)
        if (timeContext.time_of_day === 'night') {
            // Boost late-night delivery
            if (restaurant.tags?.includes('delivery') || restaurant.tags?.includes('takeaway')) {
                timeScore += 20;
            }
            // Boost bars and lounges
            if (restaurant.tags?.includes('bar') || restaurant.tags?.includes('lounge')) {
                timeScore += 15;
            }
            // Check if open late
            if (restaurant.opening_hours?.includes('11:') || restaurant.opening_hours?.includes('12:') ||
                restaurant.opening_hours?.includes('01:')) {
                timeScore += 10;
            }
        }

        // Weekend bonus
        if (timeContext.is_weekend) {
            // Boost fine dining
            if (restaurant.tags?.includes('fine-dining') || restaurant.price_level === 'expensive') {
                timeScore += 15;
            }
            // Boost brunch spots (weekend morning/afternoon)
            if ((timeContext.time_of_day === 'morning' || timeContext.time_of_day === 'afternoon') &&
                restaurant.tags?.includes('brunch')) {
                timeScore += 10;
            }
            // Boost group-friendly places
            if (restaurant.tags?.includes('group') || restaurant.tags?.includes('group-friendly')) {
                timeScore += 8;
            }
        }

        // Weekday bonus
        if (!timeContext.is_weekend) {
            // Boost quick service during lunch
            if (timeContext.time_of_day === 'afternoon' &&
                (restaurant.tags?.includes('quick-service') || restaurant.price_level === 'budget')) {
                timeScore += 10;
            }
        }

        return {
            ...restaurant,
            time_score: timeScore
        };
    });
}

export default {
    getTimeContext,
    applyTimeScoring
};
