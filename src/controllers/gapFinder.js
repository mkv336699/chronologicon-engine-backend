const { getEventCollection } = require('./events');

// Get all temporal gaps with filtering
const findTemporalGaps = async (query) => {
  const { minGapMinutes = 0, severity, limit } = query;
  const eventCollection = getEventCollection();
  
  let gaps = await eventCollection.findTemporalGaps(parseInt(minGapMinutes));
  
  // Filter by severity if specified
  if (severity) {
    gaps = gaps.filter(gap => gap.severity === severity);
  }
  
  // Apply limit if specified
  if (limit) {
    gaps = gaps.slice(0, parseInt(limit));
  }
  
  return {
    gaps,
    total: gaps.length,
    summary: {
      critical: gaps.filter(g => g.severity === 'critical').length,
      high: gaps.filter(g => g.severity === 'high').length,
      medium: gaps.filter(g => g.severity === 'medium').length,
      low: gaps.filter(g => g.severity === 'low').length
    }
  };
};

// Find critical gaps only
const findCriticalGaps = async () => {
  const eventCollection = getEventCollection();
  const gaps = (await eventCollection.findTemporalGaps(0))
    .filter(gap => gap.severity === 'critical');
  
  return {
    gaps,
    total: gaps.length,
    message: 'Critical temporal gaps found'
  };
};

// Detailed gap analysis
const analyzeGaps = async () => {
  const eventCollection = getEventCollection();
  const gaps = await eventCollection.findTemporalGaps(0);
  const events = await eventCollection.getAllEvents();
  
  // Calculate gap statistics
  const gapStats = {
    totalGaps: gaps.length,
    totalGapMinutes: gaps.reduce((sum, gap) => sum + gap.gapMinutes, 0),
    averageGapMinutes: gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap.gapMinutes, 0) / gaps.length : 0,
    maxGapMinutes: gaps.length > 0 ? Math.max(...gaps.map(gap => gap.gapMinutes)) : 0,
    minGapMinutes: gaps.length > 0 ? Math.min(...gaps.map(gap => gap.gapMinutes)) : 0,
    severityBreakdown: {
      critical: gaps.filter(g => g.severity === 'critical').length,
      high: gaps.filter(g => g.severity === 'high').length,
      medium: gaps.filter(g => g.severity === 'medium').length,
      low: gaps.filter(g => g.severity === 'low').length
    }
  };
  
  // Find events with most gaps
  const eventGapCounts = new Map();
  gaps.forEach(gap => {
    const beforeId = gap.beforeEvent.eventId;
    const afterId = gap.afterEvent.eventId;
    
    eventGapCounts.set(beforeId, (eventGapCounts.get(beforeId) || 0) + 1);
    eventGapCounts.set(afterId, (eventGapCounts.get(afterId) || 0) + 1);
  });
  
  const eventsWithMostGaps = await Promise.all(
    Array.from(eventGapCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(async ([eventId, count]) => ({
        eventId,
        gapCount: count,
        event: (await eventCollection.getEvent(eventId))?.toObject()
      }))
  );
  
  return {
    analysis: gapStats,
    eventsWithMostGaps,
    recommendations: generateGapRecommendations(gaps)
  };
};

// Simulate gap filling
const simulateGapFilling = async (simulationData) => {
  const { eventId, newStartDate, newEndDate } = simulationData;
  const eventCollection = getEventCollection();
  
  if (!eventId || !newStartDate || !newEndDate) {
    throw new Error('Missing required fields: eventId, newStartDate, newEndDate');
  }
  
  const event = await eventCollection.getEvent(eventId);
  if (!event) {
    throw new Error('Event not found');
  }
  
  // Create a temporary event with new dates
  const tempEvent = {
    eventId: eventId + '_temp',
    eventName: event.eventName,
    startDate: newStartDate,
    endDate: newEndDate,
    parentId: event.parentId,

    description: event.description
  };
  
  // Calculate gaps with the new event
  const originalGaps = eventCollection.findTemporalGaps(0);
  const { EventCollection } = require('../models/Event');
  const tempCollection = new EventCollection();
  
  // Add all events except the one being modified
  eventCollection.getAllEvents().forEach(e => {
    if (e.eventId !== eventId) {
      tempCollection.addEvent(e.toObject());
    }
  });
  
  // Add the temporary event
  tempCollection.addEvent(tempEvent);
  
  const newGaps = tempCollection.findTemporalGaps(0);
  
  // Compare gaps
  const gapComparison = {
    originalGaps: originalGaps.length,
    newGaps: newGaps.length,
    gapDifference: newGaps.length - originalGaps.length,
    affectedGaps: findAffectedGaps(originalGaps, newGaps, eventId)
  };
  
  return {
    simulation: gapComparison,
    message: 'Gap simulation completed'
  };
};

// Helper function to generate gap recommendations
function generateGapRecommendations(gaps) {
  const recommendations = [];
  
  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  if (criticalGaps.length > 0) {
    recommendations.push({
      type: 'critical',
      message: `Found ${criticalGaps.length} critical gaps (>8 hours). Consider rescheduling events to reduce downtime.`,
      priority: 'high'
    });
  }
  
  const highGaps = gaps.filter(g => g.severity === 'high');
  if (highGaps.length > 5) {
    recommendations.push({
      type: 'efficiency',
      message: `Found ${highGaps.length} high-priority gaps (2-8 hours). Consider adding buffer activities or parallel processing.`,
      priority: 'medium'
    });
  }
  
  const totalGapTime = gaps.reduce((sum, gap) => sum + gap.gapMinutes, 0);
  if (totalGapTime > 1440) { // More than 24 hours total
    recommendations.push({
      type: 'optimization',
      message: `Total gap time is ${Math.round(totalGapTime / 60)} hours. Consider optimizing event scheduling.`,
      priority: 'medium'
    });
  }
  
  return recommendations;
}

// Helper function to find affected gaps
function findAffectedGaps(originalGaps, newGaps, eventId) {
  const affected = [];
  
  // Find gaps that involve the modified event
  originalGaps.forEach(originalGap => {
    if (originalGap.beforeEvent.eventId === eventId || 
        originalGap.afterEvent.eventId === eventId) {
      const newGap = newGaps.find(g => 
        g.beforeEvent.eventId === eventId || 
        g.afterEvent.eventId === eventId
      );
      
      if (newGap) {
        affected.push({
          type: 'modified',
          original: originalGap,
          new: newGap,
          change: newGap.gapMinutes - originalGap.gapMinutes
        });
      } else {
        affected.push({
          type: 'eliminated',
          original: originalGap
        });
      }
    }
  });
  
  return affected;
}

module.exports = {
  findTemporalGaps,
  findCriticalGaps,
  analyzeGaps,
  simulateGapFilling
};
