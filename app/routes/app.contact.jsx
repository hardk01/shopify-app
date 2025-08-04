import React, { useState, useCallback, useEffect, useRef } from 'react';
import Footer from '../components/Footer';
import tutorialIcon from '../assets/tutorialIcon.png';
import { PlayIcon } from '@shopify/polaris-icons';
import { EmailIcon, ChatIcon, NoteIcon } from '@shopify/polaris-icons';
import { authenticate } from '../shopify.server.js';
import { useActionData, useSubmit, useNavigate, useLoaderData } from '@remix-run/react';
import { json } from '@remix-run/node';
import FaqSection from '../components/FaqSection';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

import {
    Card,
    Text,
    BlockStack,
    InlineGrid,
    Button,
    ButtonGroup,
    Pagination,
    Icon,
    Link,
    Box,
    Page,
    TextField,
    Select,
    InlineStack,
    Divider,
    Toast,
    Frame,
    SkeletonPage,
    SkeletonBodyText,
    SkeletonDisplayText,
    SkeletonThumbnail,
    FormLayout,
} from '@shopify/polaris';

const tutorialData = [
    {
        title: 'Getting Started with Shopify Polaris',
        desc: "Learn how to set up your first Shopify app using the Polaris design system.",
        video: 'https://www.youtube.com/watch?v=F1vQ5cF6nq8',
        instruction: 'https://polaris.shopify.com/getting-started',
    },
    {
        title: 'How to Add Custom Fields to Products',
        desc: "This tutorial shows you how to add and manage custom fields in your Shopify products.",
        video: 'https://www.youtube.com/watch?v=2Q6p6QG8b8A',
        instruction: 'https://help.shopify.com/manual/products/add-update-products',
    },
    {
        title: 'Using Polaris Components in React',
        desc: "A step-by-step guide to using Polaris React components in your Shopify app.",
        video: 'https://www.youtube.com/watch?v=3nQNiWdeH2Q',
        instruction: 'https://polaris.shopify.com/components',
    },
    {
        title: 'Implementing Pagination with Polaris',
        desc: "Learn how to add and customize pagination in your Shopify admin pages using Polaris.",
        video: 'https://www.youtube.com/watch?v=4QFQ4QG8b8A',
        instruction: 'https://polaris.shopify.com/components/navigation/pagination',
    },
];

const faqs = [
    'Why does the option not appear on my product detail page?',
    'Why does the option not appear on my product detail page?',
    'Why does the option not appear on my product detail page?',
    'Why does the option not appear on my product detail page?',
    'Why does the option not appear on my product detail page?',
];

const reasonOptions = [
    { label: 'Other', value: 'other' },
    { label: 'Technical Issue', value: 'technical' },
    { label: 'Billing', value: 'billing' },
    { label: 'Feature Request', value: 'feature' },
];

export const loader = async ({ request }) => {
    await authenticate.admin(request);
    return json({ authenticated: true });
};

function ContactSkeleton() {
    return (
        <SkeletonPage>
            {/* Header Skeleton */}
            <Box paddingBlockEnd="400">
                <Card>
                    <div style={{ padding: '20px' }}>
                        <SkeletonDisplayText size="large" />
                        <SkeletonBodyText lines={2} />
                    </div>
                </Card>
            </Box>

            {/* Contact Form Skeleton */}
            <Box paddingBlockEnd="400" display="flex" justifyContent="center">
                <Card>
                    <Box padding="600" minWidth="700px" maxWidth="900px">
                        <BlockStack gap="400">
                            <SkeletonDisplayText size="medium" />
                            <SkeletonBodyText lines={1} />
                            <FormLayout>
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i}>
                                        <SkeletonBodyText lines={1} />
                                        <Box paddingBlockStart="200">
                                            <SkeletonThumbnail size="medium" />
                                        </Box>
                                    </div>
                                ))}
                                {/* Submit button skeleton */}
                                <Box paddingBlockStart="400">
                                    <SkeletonThumbnail size="large" />
                                </Box>
                            </FormLayout>
                        </BlockStack>
                    </Box>
                </Card>
            </Box>

            {/* Tutorials Skeleton */}
            <Box display="flex" justifyContent="flex-start" paddingBlockEnd="400">
                <Card padding="500" background="bg-surface" borderRadius="2xl" paddingBlockStart="600" paddingBlockEnd="600">
                    <BlockStack gap="200">
                        <SkeletonDisplayText size="medium" />
                        <SkeletonBodyText lines={1} />
                        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                            {[1, 2].map((i) => (
                                <Card key={i} padding="400">
                                    <Box background="bg-surface">
                                        <Box display="flex" gap="100">
                                            <Box
                                                width="60px"
                                                height="60px"
                                                borderRadius="full"
                                                background="#8B5CF6"
                                                display="flex"
                                                alignItems="center"
                                                justifyContent="center"
                                                marginInlineEnd="200"
                                            >
                                                <SkeletonThumbnail size="large" />
                                            </Box>
                                            <BlockStack gap="100">
                                                <SkeletonDisplayText size="small" />
                                                <SkeletonBodyText lines={1} />
                                                <SkeletonBodyText lines={1} />
                                            </BlockStack>
                                        </Box>
                                    </Box>
                                </Card>
                            ))}
                        </InlineGrid>
                        <Box display="flex" alignItems="center" justifyContent="space-between" marginBlockStart="4">
                            <SkeletonBodyText lines={1} />
                        </Box>
                    </BlockStack>
                </Card>
            </Box>

            {/* FAQ/Help Skeleton */}
            <Box display="flex" justifyContent="flex-start" paddingBlockEnd="400">
                <Card paddingBlockStart="600" paddingBlockEnd="600" background="bg-surface" borderRadius="2xl">
                    <Box padding="20px 0px 11px 2px">
                        <SkeletonDisplayText size="medium" />
                    </Box>
                    <InlineGrid columns={3} gap="400" style={{ width: '100%' }}>
                        {[1, 2, 3].map((i) => (
                            <Card key={i} padding="400" border="base" background="bg-surface" borderRadius="lg" style={{ width: '100%', margin: 0 }}>
                                <Box marginInlineStart="200">
                                    <SkeletonBodyText lines={1} />
                                    <SkeletonBodyText lines={1} />
                                </Box>
                            </Card>
                        ))}
                    </InlineGrid>
                    <Box display="flex" justifyContent="flex-start" paddingBlockEnd="400">
                        <Box display="flex" paddingBlockStart="400">
                            {[1, 2, 3].map((i) => (
                                <Box key={i} marginBlockEnd="200">
                                    <SkeletonBodyText lines={1} />
                                </Box>
                            ))}
                        </Box>
                    </Box>
                </Card>
            </Box>
        </SkeletonPage>
    );
}

export default function Contact() {
    const { t } = useTranslation();
    const loaderData = typeof useLoaderData === 'function' ? useLoaderData() : {};
    const actionData = useActionData();
    const submit = useSubmit();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: '',
        email: '',
        code: '',
        password: '',
        reason: 'other',
        page: '',
        message: '',
    });
    const [selectedFaq, setSelectedFaq] = useState(null);
    const [submitResult, setSubmitResult] = useState(null);
    const [tutorialPage, setTutorialPage] = useState(1);
    const [toastActive, setToastActive] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastError, setToastError] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'en');
    const TUTORIALS_PER_PAGE = 2;
    const totalPages = Math.ceil(tutorialData.length / TUTORIALS_PER_PAGE);
    const pagedTutorials = tutorialData.slice(
        (tutorialPage - 1) * TUTORIALS_PER_PAGE,
        tutorialPage * TUTORIALS_PER_PAGE
    );

    const helpSectionRef = useRef(null);

    const handleChange = (field) => (value) => {
        setForm((f) => ({ ...f, [field]: value }));
    };

    const showToast = useCallback((message, isError = false) => {
        setToastMessage(message);
        setToastError(isError);
        setToastActive(true);
    }, []);

    const dismissToast = useCallback(() => {
        setToastActive(false);
    }, []);

    const handleSubmit = async () => {
        // Validate required fields
        if (!form.name || !form.email || !form.code || !form.message) {
            showToast('Please fill in all required fields', true);
            return;
        }

        setIsSubmitting(true);
        setToastActive(false);

        try {
            const formData = new FormData();
            Object.keys(form).forEach(key => {
                formData.append(key, form[key]);
            });

            const response = await fetch('/api/contact', {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                setForm({
                    name: '',
                    email: '',
                    code: '',
                    password: '',
                    reason: 'other',
                    page: '',
                    message: ''
                });
                showToast('Your message has been sent successfully!', false);
            } else {
                showToast(data.error || 'Failed to send message', true);
            }
        } catch (error) {
            showToast('Failed to send message. Please try again.', true);
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    // Scroll to help section if hash is present
    useEffect(() => {
        if (window.location.hash === '#help-section' && helpSectionRef.current) {
            helpSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, []);

    if (isLoading) {
        return <ContactSkeleton />;
    }

    return (
        <Frame>
            <Page>
                {toastActive && (
                    <Toast
                        content={toastMessage}
                        error={toastError}
                        onDismiss={dismissToast}
                        duration={4000}
                    />
                )}

                <Box paddingBlockStart="400" paddingBlockEnd="400" display="flex" justifyContent="center">
                    <Card>
                        <Box padding="600" minWidth="700px" maxWidth="900px">
                            <BlockStack gap="400">
                                <Text variant="headingLg" as="h2" fontWeight="bold">
                                    {t('contact.title')}
                                </Text>
                                <Text variant="headingMd" fontWeight="semibold">
                                    {t('contact.storeInformation')}
                                </Text>

                                {submitResult && (
                                    <div style={{
                                        padding: '12px',
                                        borderRadius: '4px',
                                        backgroundColor: submitResult.success ? '#E3F1DF' : '#FBE9E7',
                                        color: submitResult.success ? '#108043' : '#BF0711',
                                        marginBottom: '16px'
                                    }}>
                                        {submitResult.message}
                                    </div>
                                )}

                                <InlineStack gap="200">
                                    <Box width="49%">
                                        <TextField
                                            label={t('contact.your_name')}
                                            value={form.name}
                                            onChange={handleChange('name')}
                                            autoComplete="name"
                                            disabled={isSubmitting}
                                            required
                                        />
                                    </Box>
                                    <Box width="50%">
                                        <TextField
                                            label={t('contact.your_email')}
                                            value={form.email}
                                            onChange={handleChange('email')}
                                            autoComplete="email"
                                            helpText={t('contact.help_text')}
                                            disabled={isSubmitting}
                                            required
                                            type="email"
                                        />
                                    </Box>
                                </InlineStack>

                                <InlineStack gap="200">
                                    <Box width="49%">
                                        <TextField
                                            label={t('contact.collaborator_request_code')}
                                            value={form.code}
                                            onChange={handleChange('code')}
                                            autoComplete="off"
                                            requiredIndicator
                                            disabled={isSubmitting}
                                            required
                                            helpText={t('contact.code_instructions')}
                                        />
                                    </Box>
                                    <Box width="50%">
                                        <TextField
                                            label={t('contact.store_password')}
                                            value={form.password}
                                            onChange={handleChange('password')}
                                            autoComplete="off"
                                            disabled={isSubmitting}
                                            type="password"
                                            helpText={t('contact.password_instructions')}
                                        />
                                    </Box>
                                </InlineStack>

                                <Divider style={{ margin: '24px 0' }} />
                                <Text variant="headingMd" fontWeight="bold" style={{ marginBottom: 8 }}>
                                    {t('contact.contact_reason')}
                                </Text>
                                <Select
                                    label={t('contact.reason_for_contacting')}
                                    options={reasonOptions}
                                    value={form.reason}
                                    onChange={handleChange('reason')}
                                    disabled={isSubmitting}
                                    required
                                />
                                <TextField
                                    label={t('contact.page_information')}
                                    value={form.page}
                                    onChange={handleChange('page')}
                                    helpText={t('contact.page_help_text')}
                                    disabled={isSubmitting}
                                />
                                <TextField
                                    label={t('contact.message')}
                                    value={form.message}
                                    onChange={handleChange('message')}
                                    multiline={4}
                                    requiredIndicator
                                    helpText={t('contact.message_help_text')}
                                    disabled={isSubmitting}
                                    required
                                />
                                <Divider />
                                <Box>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <Button
                                            variant="primary"
                                            loading={isSubmitting}
                                            disabled={isSubmitting}
                                            onClick={handleSubmit}
                                        >
                                            {isSubmitting ? t('contact.send') : t('contact.send')}
                                        </Button>
                                    </div>
                                </Box>
                            </BlockStack>
                        </Box>
                    </Card>
                </Box>

                {/* Tutorials */}
                {/* <Box display="flex" justifyContent="flex-start" paddingBlockEnd="400">
                    <Card padding="500" background="bg-surface" borderRadius="2xl" paddingBlockStart="600" paddingBlockEnd="600">
                        <BlockStack gap="200">
                            <Text variant="headingMd">{t('import.quick_tutorials')}</Text>
                            <Text color="subdued">{t('import.quick_tutorials_subheading')}</Text>
                            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                                {Array.isArray(pagedTutorials) && pagedTutorials.map((tut, idx) => (
                                    <Card key={idx} padding="400">
                                        <Box background="bg-surface">
                                            <div style={{ display: 'flex', gap: 5 }}> */}
                                                {/* Icon on the left */}    
                                                {/* <Box
                                                    width="60px"
                                                    height="60px"
                                                    borderRadius="full"
                                                    background="#8B5CF6"
                                                    display="flex"
                                                    alignItems="center"
                                                    justifyContent="center"
                                                    marginInlineEnd="200"
                                                >
                                                    <img src={tutorialIcon} alt="Tutorial" style={{ width: 40, height: 40 }} />
                                                </Box> */}
                                                {/* Content on the right */}
                                                {/* <BlockStack gap="200">
                                                    <Text variant="headingSm">{tut.title}</Text>
                                                    <Text>{tut.description}</Text>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <Button
                                                            onClick={() => window.open(tut.video, '_blank')}
                                                            variant="secondary"
                                                            size="slim"
                                                        >
                                                            {t('import.watch_video')}
                                                        </Button>
                                                        <Link
                                                            url={tut.instruction}
                                                            external
                                                            monochrome={false}
                                                            removeUnderline={false}
                                                            style={{ marginLeft: 12, color: '#3574F2', fontWeight: 500 }}
                                                        >
                                                            {t('import.read_instruction')}
                                                        </Link>
                                                    </div>
                                                </BlockStack>
                                            </div>
                                        </Box>
                                    </Card>
                                ))}
                            </InlineGrid>
                            <Box display="flex" alignItems="center" justifyContent="space-between" marginBlockStart="4">
                                <Pagination
                                    hasPrevious={tutorialPage > 1}
                                    onPrevious={() => setTutorialPage(tutorialPage - 1)}
                                    hasNext={tutorialPage < totalPages}
                                    onNext={() => setTutorialPage(tutorialPage + 1)}
                                    label={`${tutorialPage}/${totalPages}`}
                                />
                            </Box>
                        </BlockStack>
                    </Card>
                </Box> */}

                {/* Help Section */ /* FAQ Section */}
                <Box ref={helpSectionRef} display="flex" justifyContent="flex-start" >
                    <Card paddingBlockStart="600" paddingBlockEnd="600" background="bg-surface" borderRadius="2xl">
                        <div style={{ padding: '5px 0px 11px 2px' }}>
                            <Text variant="headingMd" as="h2" fontWeight="bold">
                                {t('import.need_help_or_import')}
                            </Text>
                        </div>
                        <InlineGrid columns={3} gap="400" style={{ width: '100%' }}>
                            <Card padding="400" border="base" background="bg-surface" borderRadius="lg" style={{ width: '100%', margin: 0 }}>
                                <Box marginInlineStart="200">
                                    <Link url="#" monochrome={false} style={{ color: '#3574F2', fontWeight: 500 }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                            <Icon source={EmailIcon} color="interactive" />
                                            {t('import.get_email_support')}
                                        </span>
                                    </Link>
                                    <Text color="subdued" fontSize="bodySm">
                                        {t('import.email_support_description')}
                                    </Text>
                                </Box>
                            </Card>
                            <Card padding="400" border="base" background="bg-surface" borderRadius="lg" style={{ width: '100%', margin: 0 }}>
                                <Box marginInlineStart="200">
                                    <Link url="#" monochrome={false} style={{ color: '#3574F2', fontWeight: 500 }} onClick={e => { e.preventDefault(); if (window.$crisp) window.$crisp.push(["do", "chat:open"]); }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                            <Icon source={ChatIcon} color="interactive" />
                                            {t('import.start_live_chat')}
                                        </span>
                                    </Link>
                                    <Text color="subdued" fontSize="bodySm">
                                        {t('import.live_chat_description')}
                                    </Text>
                                </Box>
                            </Card>
                            <Card padding="400" border="base" background="bg-surface" borderRadius="lg" style={{ width: '100%', margin: 0 }}>
                                <Box marginInlineStart="200">
                                    <Link url="#" monochrome={false} style={{ color: '#3574F2', fontWeight: 500 }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                            <Icon source={NoteIcon} color="interactive" />
                                            {t('import.help_docs')}
                                        </span>
                                    </Link>
                                    <Text color="subdued" fontSize="bodySm">
                                        {t('import.help_docs_description')}
                                    </Text>
                                </Box>
                            </Card>
                        </InlineGrid>
                        <Box display="flex" paddingBlockStart="400" paddingBlockEnd="400">
                            <FaqSection />
                        </Box>
                    </Card>
                </Box>

                {/* Footer */}
                <Footer />
            </Page>
        </Frame>
    );
} 