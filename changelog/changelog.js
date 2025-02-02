import changelog from "conventional-changelog";

const commitPartial = ` - {{header}}
{{~!-- commit hash --}} {{#if @root.linkReferences}}([{{hash}}]({{#if @root.host}}{{@root.host}}/{{/if}}{{#if @root.owner}}{{@root.owner}}/{{/if}}{{@root.repository}}/{{@root.commit}}/{{hash}})){{else}}{{hash~}}{{/if}}
{{~!-- commit references --}}{{#if references}}, closes{{~#each references}} {{#if @root.linkReferences}}[{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}#{{this.issue}}]({{#if @root.host}}{{@root.host}}/{{/if}}{{#if this.repository}}{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}{{else}}{{#if @root.owner}}{{@root.owner}}/{{/if}}{{@root.repository}}{{/if}}/{{@root.issue}}/{{this.issue}}){{else}}{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}#{{this.issue}}{{/if}}{{/each}}{{/if}}
`;

const headerPartial = `## {{version}}{{#if title}} "{{title}}"{{/if}}{{#if date}} - {{date}}{{/if}}
`;

/**
 * Generate a changelog and output it to the specified stream.
 * @param {Object} options - Options for generating the changelog.
 * @param {WritableStream} outputStream - The stream to output the changelog to.
 */
export function generateChangelog(options, outputStream) {
  changelog(
    {
      releaseCount: options.releaseCount || 100000,
      // preset: 'jshint' // Uncomment and set preset if needed
    },
    null,
    null,
    null,
    {
      transform: function (commit) {
        // Removed the filtering condition to include all commits
        return commit;
      },
      commitPartial: commitPartial,
      headerPartial: headerPartial,
    }
  ).pipe(outputStream);
}

// If the module is run directly, generate the changelog and output to stdout
if (import.meta.url === new URL(import.meta.url).href) {
  generateChangelog({}, process.stdout);
}
