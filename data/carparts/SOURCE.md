# Car parts demand (real data)

`car_parts_dataset_without_missing_values.tsf`: monthly unit sales of 2,674 car
parts from a US car company, January 1998 to March 2002 (51 months). Missing
months were replaced with zeros by the publishers.

- Original: Hyndman, R. J. (2015). *expsmooth: Data Sets from "Forecasting with
  Exponential Smoothing"*. R package version 2.3. https://CRAN.R-project.org/package=expsmooth
- This copy: Godahewa, R., Bergmeir, C., Webb, G., Hyndman, R., Montero-Manso, P.
  *Monash Time Series Forecasting Archive*, Car Parts Dataset (without missing
  values). Zenodo, https://doi.org/10.5281/zenodo.4656021
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0).

Kaveri Desk uses these series as the demand pattern ("demand DNA") of its spare
parts catalogue. See `lib/data/` for how they are classified and turned into
daily sales.
