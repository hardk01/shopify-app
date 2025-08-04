import React, { useState } from 'react';
import { Text } from '@shopify/polaris';
import { useTranslation } from 'react-i18next';

export default function FaqSection() {
  const { t } = useTranslation();
  // Get the FAQ array from the translation file
  const faqs = t('faq', { returnObjects: true });
  const [selectedFaq, setSelectedFaq] = useState(null);
  if (!Array.isArray(faqs)) {
    return null; // or return <div>No FAQs available.</div> if you want a message
  }
  return (
    <div>
      {faqs.map((faq, idx) => {
        const isOpen = selectedFaq === idx;
        return (
          <div
            key={idx}
            style={{
              marginBottom: 12,
              background: isOpen ? '#fff' : '#F6F6F7',
              border: isOpen ? '1px solid #E3E3E3' : 'none',
              borderRadius: isOpen ? 8 : 5,
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
              transition: 'box-shadow 0.2s, background 0.2s, border 0.2s',
              boxShadow: isOpen ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
            }}
          >
            <button
              onClick={() => setSelectedFaq(isOpen ? null : idx)}
              aria-expanded={isOpen}
              aria-controls={`faq-${idx}`}
              style={{
                width: '100%',
                background: isOpen ? '#fff' : 'none',
                border: 'none',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 24px',
                cursor: 'pointer',
                color: '#202223',
                borderRadius: isOpen ? 8 : 12,
                transition: 'background 0.2s, border-radius 0.2s, padding 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = isOpen ? '#fff' : '#EFEFEF')}
              onMouseOut={e => (e.currentTarget.style.background = isOpen ? '#fff' : 'transparent')}
            >
              <Text variant="headingSm" fontWeight="bold" as="span" style={{ flex: 1, textAlign: 'left' }}>{faq.question}</Text>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 20,
                  width: 20,
                  transform: isOpen ? 'rotate(-90deg)' : 'rotate(90deg)',
                  transformOrigin: '50% 50%',
                  transition: 'transform 0.2s',
                  color: '#8C9196',
                  fontSize: 20,
                  marginLeft: 8,
                }}
              >
                &#8250;
              </span>
            </button>
            {isOpen && (
              <div
                style={{
                  padding: '12px 24px 18px 24px',
                  color: '#202223',
                  whiteSpace: 'pre-line',
                }}
              >
                <Text variant="bodyMd" as="div">{faq.answer}</Text>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
} 