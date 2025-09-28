import pandas as pd
from ydata_profiling import ProfileReport

# Load the XLSX file
file_path = "data-raw.xlsx"  
df = pd.read_excel(file_path)

# Transform to wide format
df_wide = df.pivot_table(
    index=['year', 'countryIsoCode', 'country'], 
    columns='indicator', 
    values='value',
    aggfunc='first' 
).reset_index()

# Clean up column names (remove the 'indicator' index name)
df_wide.columns.name = None

# Sort columns by data completeness (most complete first) 
completeness = df_wide.count().sort_values(ascending=False)
column_order = completeness.index.tolist()

# Reorder dataframe columns by completeness
df_wide = df_wide[column_order]

# Display transformation results
print(f"Original shape: {df.shape}")
print(f"Transformed shape: {df_wide.shape}")
print(f"Columns: {list(df_wide.columns[:5])}...")

# Save to new file
df_wide.to_excel('data.xlsx', index=False)

# Check data quality
print(f"\nMissing values per column:")
missing_stats = df_wide.isnull().sum().sort_values(ascending=False)
print(missing_stats.head(10))

# Print column ordering by completeness for reference
print(f"\nColumn order by completeness (top 10):")
for i, col in enumerate(column_order[:10], 1):
    missing_pct = (1 - completeness[col] / len(df_wide)) * 100
    print(f"{i}. {col}: {missing_pct:.1f}% missing")

# Generate EDA report with columns sorted by completeness
profile = ProfileReport(df_wide, title="HDI Dataset Analysis", explorative=True)
profile.to_file("eda.html")
