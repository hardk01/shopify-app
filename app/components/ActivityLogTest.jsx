import React, { useState } from 'react';
import { Card, Button, Text, Box, BlockStack, InlineStack } from '@shopify/polaris';

export function ActivityLogTest() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const testActivity = async (type, count = 1) => {
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/test-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, count }),
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd">Test Activity Logging</Text>
        
        <InlineStack gap="200">
          <Button 
            loading={loading} 
            onClick={() => testActivity('image_compression', 5)}
          >
            Test Image Compression (5)
          </Button>
          <Button 
            loading={loading} 
            onClick={() => testActivity('webp_conversion', 3)}
          >
            Test WebP Conversion (3)
          </Button>
          <Button 
            loading={loading} 
            onClick={() => testActivity('alt_text', 2)}
          >
            Test Alt Text (2)
          </Button>
        </InlineStack>
        
        {result && (
          <Box padding="300" background={result.success ? "bg-surface-success" : "bg-surface-critical"}>
            <Text variant="bodySm">
              {result.success 
                ? `✓ Activity logged: ${result.activity?.type} (${result.activity?.count} items)`
                : `✗ Error: ${result.error}`
              }
            </Text>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
