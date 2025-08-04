import React, { useState, useEffect } from 'react';
import {
  Card,
  Text,
  Button,
  ButtonGroup,
  DataTable,
  Spinner,
  Box,
  InlineStack,
  BlockStack
} from '@shopify/polaris';

export function ActivityStats() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [detailedStats, setDetailedStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(7);
  const [error, setError] = useState(null);

  const fetchStats = async (days = 7, includeDetailed = false, includeRecent = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        days: days.toString(),
        detailed: includeDetailed.toString(),
        recent: includeRecent.toString()
      });
      
      const response = await fetch(`/api/activity-stats?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data.stats);
        if (includeDetailed) {
          setDetailedStats(data.data.detailedStats);
        }
        if (includeRecent) {
          setRecentActivities(data.data.recentActivities);
        }
      } else {
        setError(data.error || 'Failed to fetch statistics');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Failed to fetch activity stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(selectedPeriod, true, true);
  }, [selectedPeriod]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatActivityType = (type) => {
    switch (type) {
      case 'image_compression':
        return 'Image Compression';
      case 'webp_conversion':
        return 'WebP Conversion';
      case 'alt_text':
        return 'Alt Text';
      default:
        return type;
    }
  };

  // Prepare detailed stats for data table
  const detailedRows = detailedStats ? detailedStats.map(day => {
    const activities = day.activities.reduce((acc, activity) => {
      acc[activity.type] = activity.count;
      return acc;
    }, {});
    
    return [
      formatDate(day._id),
      activities.image_compression || 0,
      activities.webp_conversion || 0,
      activities.alt_text || 0,
      (activities.image_compression || 0) + (activities.webp_conversion || 0) + (activities.alt_text || 0)
    ];
  }) : [];

  // Prepare recent activities for data table
  const recentRows = recentActivities ? recentActivities.map(activity => [
    formatDateTime(activity.createdAt),
    formatActivityType(activity.type),
    activity.count,
    activity.shop
  ]) : [];

  return (
    <BlockStack gap="500">
      {/* Period Selection */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h3">Activity Statistics</Text>
          <InlineStack gap="200">
            <Text>Time Period:</Text>
            <ButtonGroup segmented>
              <Button 
                pressed={selectedPeriod === 7} 
                onClick={() => setSelectedPeriod(7)}
              >
                Last 7 Days
              </Button>
              <Button 
                pressed={selectedPeriod === 14} 
                onClick={() => setSelectedPeriod(14)}
              >
                Last 14 Days
              </Button>
              <Button 
                pressed={selectedPeriod === 30} 
                onClick={() => setSelectedPeriod(30)}
              >
                Last 30 Days
              </Button>
            </ButtonGroup>
          </InlineStack>
        </BlockStack>
      </Card>

      {loading && (
        <Card>
          <Box padding="400">
            <InlineStack align="center">
              <Spinner size="small" />
              <Text>Loading statistics...</Text>
            </InlineStack>
          </Box>
        </Card>
      )}

      {error && (
        <Card>
          <Box padding="400">
            <Text tone="critical">{error}</Text>
          </Box>
        </Card>
      )}

      {/* Summary Stats */}
      {stats && !loading && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h3">Summary ({stats.period})</Text>
            <InlineStack gap="400">
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="headingSm">Image Compression</Text>
                  <Text variant="heading2xl">{stats.imageCompression}</Text>
                </BlockStack>
              </Box>
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="headingSm">WebP Conversion</Text>
                  <Text variant="heading2xl">{stats.webpConversion}</Text>
                </BlockStack>
              </Box>
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="headingSm">Alt Text</Text>
                  <Text variant="heading2xl">{stats.altText}</Text>
                </BlockStack>
              </Box>
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="headingSm">Total Activities</Text>
                  <Text variant="heading2xl">{stats.totalActivities}</Text>
                </BlockStack>
              </Box>
            </InlineStack>
          </BlockStack>
        </Card>
      )}

      {/* Daily Breakdown */}
      {detailedStats && detailedStats.length > 0 && !loading && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h3">Daily Breakdown</Text>
            <DataTable
              columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric']}
              headings={['Date', 'Image Compression', 'WebP Conversion', 'Alt Text', 'Total']}
              rows={detailedRows}
            />
          </BlockStack>
        </Card>
      )}

      {/* Recent Activities */}
      {recentActivities && recentActivities.length > 0 && !loading && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h3">Recent Activities (Last 10)</Text>
            <DataTable
              columnContentTypes={['text', 'text', 'numeric', 'text']}
              headings={['Date & Time', 'Activity Type', 'Count', 'Shop']}
              rows={recentRows}
            />
          </BlockStack>
        </Card>
      )}

      {/* No Data Message */}
      {stats && stats.totalActivities === 0 && !loading && (
        <Card>
          <Box padding="400">
            <Text alignment="center">
              No activities found for the selected period. Start using image compression, WebP conversion, or alt text features to see statistics here.
            </Text>
          </Box>
        </Card>
      )}
    </BlockStack>
  );
}
