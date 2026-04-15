export function generateSourcePage(
	title: string,
	content: string,
	source: string,
	author?: string,
	date?: string
): string {
	const now = new Date().toISOString().split('T')[0];

	return `---
type: source
created: ${now}
modified: ${now}
sources: ["${source}"]
tags: []
---

# ${title}

**Author:** ${author || 'Unknown'}
**Date:** ${date || 'Unknown'}
**Source:** ${source}

## Summary

<!-- AI-generated summary will be inserted here -->

## Key Points

<!-- AI-generated key points will be inserted here -->

## Content

${content}

## References

- → [[${source}]]
`;
}

export function generateEntityPage(
	name: string,
	description: string,
	attributes?: Record<string, string | number | boolean | null>
): string {
	const now = new Date().toISOString().split('T')[0];

	return `---
type: entity
created: ${now}
modified: ${now}
tags: [entity]
---

# ${name}

## Summary

${description}

## Attributes

${attributes ? Object.entries(attributes)
		.map(([key, value]) => `- **${key}:** ${value}`)
		.join('\n') : '- *No attributes defined*'}

## Connections

<!-- Related entities will be linked here -->

## References

<!-- Source files will be listed here -->
`;
}

export function generateConceptPage(
	name: string,
	definition: string,
	details?: string
): string {
	const now = new Date().toISOString().split('T')[0];

	return `---
type: concept
created: ${now}
modified: ${now}
tags: [concept]
---

# ${name}

## Definition

${definition}

## Explanation

${details || '*No additional details provided*'}

## Applications

<!-- Use cases and applications will be listed here -->

## Related Concepts

<!-- Related concepts will be linked here -->

## References

<!-- Source files will be listed here -->
`;
}
